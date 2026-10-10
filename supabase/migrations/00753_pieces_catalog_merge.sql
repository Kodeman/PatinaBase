-- ═══════════════════════════════════════════════════════════════════════════
-- 00753 — Merge catalog duplicates, never hard delete (US-21 T-47, SQ-653;
--         D11, Q11, S5)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 W5 00753 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). R1 F30: a hard DELETE of a product un-fills every line that
-- uses it, through project_ffe_items.product_id ON DELETE SET NULL (00066:261).
--
-- New: public.merge_studio_product(p_from uuid, p_into uuid) RETURNS jsonb
--   Both are studio-layer products of one studio the caller is an active
--   owner, admin or member of (the products_studio_update USING, 00152:363).
--   p_from is the duplicate; p_into is kept. It re-points, from p_from to
--   p_into:
--     - project_ffe_items.product_id, every line, removed lines included (a
--       removed line can be restored, D8). Each line's project must pass
--       _ffe_require_studio_project (00717:75). The spec row
--       (project_ffe_specs) is keyed by ffe_item_id, so it follows its line;
--       its authored content is not rewritten.
--     - proposal_board_items.product_id, except on a board of a proposal that
--       is no longer a draft (guard_proposal_child_draft_only: issued copy is
--       immutable). Those keep p_from, which stays a live row.
--     - project_products.product_id (the project product list), except where
--       the project already lists p_into (UNIQUE (project_id, product_id)).
--     - products.merged_into_id of products merged earlier into p_from, so no
--       merge chain points at a merged product.
--   Then it sets merged_into_id = p_into and deleted_at = now() on p_from
--   (columns 00152:55-56). Frozen records (furnishing_authorization_items,
--   project_review_items, PO and spec-book snapshots) keep p_from: they are
--   immutable, and p_from is never deleted.
--   Refuses: the same product twice; either product outside the caller's
--   studios, not studio layer, or in two studios; a p_from or p_into already
--   merged or removed; a line on p_from that carries a product configuration
--   (a configuration belongs to its product; guard_project_ffe_configuration_
--   integrity would refuse the move).
--
-- New: public._product_on_a_schedule_line(p_product_id uuid) RETURNS boolean
--   SECURITY DEFINER, so the DELETE policy sees every line, including lines
--   in projects the caller cannot read. An invoker NOT EXISTS under
--   project_ffe_items RLS would let a delete through and un-fill those lines.
--
-- CREATE OR REPLACE base: policy products_studio_delete, 00584:1270-1282.
--   Narrowed to products with NO project_ffe_items.product_id reference
--   (active or removed). A referenced delete matches no row and deletes
--   nothing (S5); merge instead.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- Idempotent: CREATE OR REPLACE, DROP POLICY IF EXISTS, REVOKE/GRANT.
-- Test: supabase/tests/catalog/pieces_catalog_merge_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The reference check the DELETE policy uses ──────────────────────────

CREATE OR REPLACE FUNCTION public._product_on_a_schedule_line(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.product_id = p_product_id
  );
$$;

COMMENT ON FUNCTION public._product_on_a_schedule_line(uuid) IS
  'True when any project_ffe_items row (active or removed) names the product. SECURITY DEFINER so '
  'products_studio_delete (00753) sees lines the caller cannot read. D11, R1 F30.';

REVOKE ALL ON FUNCTION public._product_on_a_schedule_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._product_on_a_schedule_line(uuid) TO authenticated;

-- ─── 2. products_studio_delete: unreferenced studio products only ───────────
-- Base 00584:1270-1282, copied, plus the last conjunct.

DROP POLICY IF EXISTS products_studio_delete ON public.products;
CREATE POLICY products_studio_delete ON public.products
  FOR DELETE TO authenticated
  USING (
    layer = 'studio'
    AND studio_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin', 'member')
    )
    AND NOT public._product_on_a_schedule_line(id)
  );

-- ─── 3. merge_studio_product ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_studio_product(p_from uuid, p_into uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from public.products%ROWTYPE;
  v_into public.products%ROWTYPE;
  v_project_id uuid;
  v_lines integer := 0;
  v_board_items integer := 0;
  v_project_products integer := 0;
  v_merged_records integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_into IS NULL THEN
    RAISE EXCEPTION 'Name the duplicate and the product to keep.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from = p_into THEN
    RAISE EXCEPTION 'A product cannot merge into itself.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock both rows in id order, so two crossed merges cannot deadlock.
  PERFORM 1 FROM public.products
  WHERE id IN (p_from, p_into)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_from FROM public.products WHERE id = p_from;
  SELECT * INTO v_into FROM public.products WHERE id = p_into;

  -- The products_studio_update USING (00152:363), for both rows.
  IF v_from.id IS NULL OR v_into.id IS NULL
     OR v_from.layer IS DISTINCT FROM 'studio'
     OR v_into.layer IS DISTINCT FROM 'studio'
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members om
       WHERE om.user_id = auth.uid()
         AND om.organization_id = v_from.studio_id
         AND om.status = 'active'
         AND om.role IN ('owner', 'admin', 'member')
     )
  THEN
    RAISE EXCEPTION 'product not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_into.studio_id IS DISTINCT FROM v_from.studio_id THEN
    RAISE EXCEPTION 'product not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_from.merged_into_id IS NOT NULL OR v_from.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This product was already merged or removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_into.merged_into_id IS NOT NULL OR v_into.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'The product to keep was merged or removed.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every project with a line on the duplicate must be one the caller may buy
  -- for; the merge writes those lines.
  FOR v_project_id IN
    SELECT DISTINCT item.project_id
    FROM public.project_ffe_items item
    WHERE item.product_id = p_from
    ORDER BY item.project_id
  LOOP
    PERFORM public._ffe_require_studio_project(v_project_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN public.project_ffe_specs spec ON spec.ffe_item_id = item.id
    WHERE item.product_id = p_from
      AND spec.configuration_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A line uses a configuration of this product, so it cannot merge.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lines: re-pointed, never un-filled.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET product_id = p_into
  WHERE product_id = p_from;
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  PERFORM set_config('app.ffe_mutation_rpc', '', true);

  -- Board items, after the lines, so guard_board_selection_ownership sees the
  -- linked line already on p_into. Issued proposal copy is left as it was.
  UPDATE public.proposal_board_items board_item
  SET product_id = p_into
  WHERE board_item.product_id = p_from
    AND NOT EXISTS (
      SELECT 1
      FROM public.proposal_boards board
      JOIN public.proposals proposal ON proposal.id = board.proposal_id
      WHERE board.id = board_item.board_id
        AND proposal.status <> 'draft'
    );
  GET DIAGNOSTICS v_board_items = ROW_COUNT;

  UPDATE public.project_products listed
  SET product_id = p_into
  WHERE listed.product_id = p_from
    AND NOT EXISTS (
      SELECT 1 FROM public.project_products kept
      WHERE kept.project_id = listed.project_id
        AND kept.product_id = p_into
    );
  GET DIAGNOSTICS v_project_products = ROW_COUNT;

  UPDATE public.products
  SET merged_into_id = p_into
  WHERE merged_into_id = p_from;
  GET DIAGNOSTICS v_merged_records = ROW_COUNT;

  UPDATE public.products
  SET merged_into_id = p_into,
      deleted_at = now()
  WHERE id = p_from;

  RETURN jsonb_build_object(
    'fromId', p_from,
    'intoId', p_into,
    'lines', v_lines,
    'boardItems', v_board_items,
    'projectProducts', v_project_products,
    'earlierMerges', v_merged_records
  );
END;
$$;

COMMENT ON FUNCTION public.merge_studio_product(uuid, uuid) IS
  'D11 (00753): merges a studio catalog duplicate p_from into p_into. Re-points schedule lines, '
  'board items and project product lists, then sets merged_into_id and deleted_at on p_from. '
  'Never hard deletes; no line is un-filled.';

REVOKE ALL ON FUNCTION public.merge_studio_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_studio_product(uuid, uuid) TO authenticated;
