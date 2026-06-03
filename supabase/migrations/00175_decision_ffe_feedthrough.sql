-- Migration: 00175_decision_ffe_feedthrough.sql
-- Decision Framework follow-up · FF&E auto-creation on a decision win
--
-- Closes the loop opened by the library/catalog-first decision builder: when a
-- decision resolves and the WINNING option points to a real catalog/library
-- product, drop that product onto the project's FF&E schedule so procurement
-- picks it up automatically. Before this, apply_decision (00085) only cleared
-- `blocked_by_decision_id`; the winning product never materialised as a line.
--
-- Design decisions (deliberate, money-safe):
--   • Gated on `project_id IS NOT NULL AND option.product_id IS NOT NULL AND
--     decision.blocking_status = 'non_blocking'`. A NON-blocking product decision
--     is a net-new choice → create a line. A BLOCKING decision gates EXISTING
--     FF&E items (substitution/approval); auto-creating there would duplicate the
--     line it gates, so it only unblocks (step 3) and never creates.
--     blocking_status is STABLE across reopen/re-apply — unlike the post-cleared
--     blocked_by_decision_id flags — so the exclusion is durable on every call.
--   • Idempotent via a new `source_decision_id` column + a UNIQUE partial index.
--     First resolution INSERTs one line; a re-apply (reopen → re-choose) UPDATEs
--     that same line to the new winner. A re-apply whose new winner has no
--     product_id leaves the prior line untouched (non-destructive — the designer
--     may have since attached a PO). The unique index is a loud backstop against
--     any duplicate insert (concurrency, future callers).
--   • Does NOT mutate projects.budget_cents / committed_cents. The live FF&E
--     aggregation (useProjectFinancials) reflects the new line in the category
--     breakdown immediately; growing the stored budget cap is a change-order
--     concern (use-scope-changes), not an automatic side effect of a decision.
--   • Defensively drops a cross-project room link (room_id that doesn't belong to
--     the decision's project) rather than persisting it.
--
-- Follow-up (NOT in this migration): the substitution path — UPDATE the gated
-- item in place to the winning product — remains unimplemented (promised in
-- 00085's header but never built). Left as a dedicated ticket because a decision
-- can gate multiple items and the replacement target is ambiguous.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PROVENANCE COLUMN — which decision auto-created this FF&E line
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ON DELETE SET NULL: deleting a decision must never cascade-delete a
-- procurement line (it may already carry a PO, ETA, received quantity, …).

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS source_decision_id UUID
    REFERENCES public.client_decisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_ffe_items.source_decision_id IS
  'The client_decision whose winning option auto-created this FF&E line '
  '(00175). One line per decision (UNIQUE partial index); apply_decision '
  'updates it in place on re-apply. NULL for lines created any other way. '
  'Distinct from blocked_by_decision_id (line is GATED by a decision).';

-- UNIQUE so the "one FF&E line per decision" invariant is DB-enforced — any
-- duplicate insert fails loudly instead of silently double-counting budget.
-- Doubles as the lookup index for the step-4 UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_ffe_items_source_decision
  ON public.project_ffe_items(source_decision_id)
  WHERE source_decision_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. apply_decision — append step 4 (FF&E feed-through)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Steps 1–3 are byte-for-byte the 00085 body (mark responded, select option,
-- clear blocked). Step 4 is new. search_path hardened to (public, pg_temp) to
-- match the 00171/00173/00174 convention.

CREATE OR REPLACE FUNCTION apply_decision(
  p_decision_id UUID,
  p_selected_option_id UUID,
  p_selected_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision RECORD;
  v_option   RECORD;
  v_room_id  UUID;
BEGIN
  SELECT * INTO v_decision
  FROM client_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision % not found', p_decision_id;
  END IF;

  IF v_decision.status NOT IN ('pending', 'open', 'draft') THEN
    RAISE EXCEPTION 'Decision % already in status %', p_decision_id, v_decision.status;
  END IF;

  SELECT * INTO v_option
  FROM client_decision_options
  WHERE id = p_selected_option_id AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option % does not belong to decision %', p_selected_option_id, p_decision_id;
  END IF;

  -- 1. Mark decision responded
  UPDATE client_decisions
  SET status = 'responded',
      responded_at = NOW(),
      selected_by = COALESCE(p_selected_by, auth.uid()),
      updated_at = NOW()
  WHERE id = p_decision_id;

  -- 2. Mark the chosen option as selected (others as not)
  UPDATE client_decision_options
  SET selected = (id = p_selected_option_id)
  WHERE decision_id = p_decision_id;

  -- 3. Clear blocked status on FF&E items that referenced this decision
  UPDATE project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = NOW(),
      updated_at = NOW()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- 4. Feed the winning product onto the project's FF&E schedule.
  --    Net-new (non-blocking) product decisions only; blocking decisions gate
  --    existing items and must not spawn a duplicate line. The blocking_status
  --    gate is stable across re-applies, so this never duplicates on reopen.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking' THEN

    -- Drop the room link if it doesn't belong to this project (latent 00172
    -- room_id has no cross-project constraint).
    v_room_id := (
      SELECT id FROM project_rooms
      WHERE id = v_decision.room_id AND project_id = v_decision.project_id
    );

    -- Re-apply: update the single line we previously created for this decision.
    UPDATE project_ffe_items
    SET product_id       = v_option.product_id,
        name             = v_option.name,
        project_room_id  = v_room_id,
        quantity         = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        line_total_cents = COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1),
        updated_at       = NOW()
    WHERE source_decision_id = p_decision_id;

    -- First resolution: create the line.
    IF NOT FOUND THEN
      INSERT INTO project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents, line_total_cents
      ) VALUES (
        v_decision.project_id,
        v_room_id,
        v_option.product_id,
        p_decision_id,
        v_option.name,
        'fixed',
        'specified',
        COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0),
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_decision(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION apply_decision(UUID, UUID, UUID) IS
  'Resolves a decision: marks it responded, selects the chosen option, clears '
  'blocked_by_decision_id on gated FF&E items, AND (00175) feeds a winning '
  'product-linked option from a NON-blocking decision onto the project FF&E '
  'schedule — idempotent per decision via source_decision_id (UNIQUE), skipped '
  'for blocking decisions. Does not mutate project budget columns.';
