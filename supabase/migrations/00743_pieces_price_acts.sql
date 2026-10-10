-- ═══════════════════════════════════════════════════════════════════════════
-- 00743 — Price acts: Make it an allowance (US-21 T-35, SQ-641; D12, Q7, Q12)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 W4 00743 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). The one writable client-visible act of the Price lens (§1.2
-- "Client price": client price and markup stay read-only in this release).
--
-- New: public.make_ffe_line_allowance(p_item_id uuid,
--                                     p_budget_max_cents integer)
--        RETURNS public.project_ffe_items
--   Sets item_type = 'allowance' and budget_max_cents (the ceiling, > 0).
--   budget_min_cents keeps its value, defaulting to 0 as the placement path
--   does (00445:174-176), and never sits above the new ceiling.
--   rough_cents is left alone (D12: the studio's rough $ is internal and never
--   becomes a client figure). unit_price_cents and line_total_cents are left
--   alone.
--   Refuses:
--     - a ceiling that is NULL or not above 0;
--     - a labor line ("Labor can't be an allowance."; Q12 ruling);
--     - a removed line ("This line was removed.");
--     - a released line: on a sent, signed or executed authorization
--       (ffe_line_authorization_state, 00705:79) or on a PO (R8: "Released
--       lines change through Record a change."). The Q12 variance on a signed
--       allowance is not this function's job.
--   Gate: _ffe_require_studio_project (00717:75). Writes under
--   app.ffe_mutation_rpc (guard_ffe_rpc_mutation, 00438:371).
--
-- No CREATE OR REPLACE base: the function is new. No client RPC changes:
-- rough_cents stays out of get_client_project_threshold (00580:167) and
-- get_client_project_selections (00441:82), which the test asserts.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- Idempotent: CREATE OR REPLACE, REVOKE/GRANT.
-- Test: supabase/tests/ffe/pieces_price_acts_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.make_ffe_line_allowance(
  p_item_id uuid,
  p_budget_max_cents integer
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items
   WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  IF p_budget_max_cents IS NULL OR p_budget_max_cents <= 0 THEN
    RAISE EXCEPTION 'An allowance needs a ceiling above $0.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.line_kind = 'labor' THEN
    RAISE EXCEPTION 'Labor can''t be an allowance.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL
     OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Released lines change through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET item_type = 'allowance',
         budget_max_cents = p_budget_max_cents,
         budget_min_cents = LEAST(COALESCE(budget_min_cents, 0), p_budget_max_cents),
         updated_at = now()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION public.make_ffe_line_allowance(uuid, integer) IS
  'Make it an allowance (00743, US-21 T-35): item_type allowance with a ceiling (budget_max_cents > 0); '
  'rough_cents, unit_price_cents and line_total_cents are left alone. Refuses labor, a removed line, and '
  'a released one (on a sent, signed or executed authorization, or on a PO): "Released lines change '
  'through Record a change." Gate: _ffe_require_studio_project. Returns the updated line.';

REVOKE ALL ON FUNCTION public.make_ffe_line_allowance(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_ffe_line_allowance(uuid, integer) TO authenticated;
