-- ═══════════════════════════════════════════════════════════════════════════
-- 00218 — resolve_coordination_item: the one-act coordination resolve (Track 5)
--
-- The coordination analog of sign_proposal (00210): ONE SECURITY DEFINER RPC,
-- ONE transaction, many surfaces light up. Resolving an open item (answer an
-- RFI, approve a submittal, pick a selection, settle a sign-off, verify a punch)
-- atomically: marks the item resolved, then CASCADES — clears FF&E blocks, flips
-- downstream tasks blocked→todo, and shifts the ball to the next court. Margin /
-- Desk / client-mirror are VIEWS (margin_items, document_state, the read models
-- in 00219); they recompute on read — this RPC writes NO margin/Desk row.
--
-- Pattern (mirrors sign_proposal 00210 + apply_decision 00175):
--   · SECURITY DEFINER, search_path=public,pg_temp.
--   · FOR UPDATE row-lock — serializes concurrent resolves of the same item.
--   · IDEMPOTENT early-return when status='responded' (retries are no-ops).
--   · authorize via may_resolve_coordination_item (court + kind + R46–R49).
--   · dispatch by coordination_kind; SELECTION DELEGATES to the proven
--     apply_decision (its own status guard, option-select, FF&E feed-through).
--   · the cascade runs in the SAME transaction — never a deferred sync.
--
-- Provisional rulings encoded (DECISIONS R46–R49):
--   R46 — tracked, login-less parties: the designer (project owner) may resolve
--         ANY item, recording a GC/vendor move on their behalf.
--   R47 — RFI: the designer writes `answer` and resolves; the GC's court is
--         tracked, designer-recorded.
--   R48 — Submittal: a vendor RESUBMIT is a new revision row (the item stays
--         pending — handled by the composer/revise path, not this RPC). Only a
--         designer-recorded APPROVE of a revision resolves the item (releasing
--         fabrication). may_resolve gates the resolve to the designer for
--         submittals.
--   R49 — Punch: default court while open is gc (they fix); resolving is the
--         designer "verify & close" — the ball hands gc→designer via
--         next_court_for/p_next_court before final resolve.
--
-- Additive only (D7): new helpers + RPC. apply_decision (00175), the 00171
-- guard, and every view are reused, not changed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- next_court_for(item) — the default ball hand-off after a resolve
-- ═══════════════════════════════════════════════════════════════════════════
-- Where the ball goes once an item is resolved, by workflow shape:
--   rfi answered      → 'gc'      (the RFI's asker can now proceed)
--   submittal approved→ 'vendor'  (the vendor may fabricate)
--   selection resolved→ 'designer'(the designer specs/orders the choice)
--   signoff approved  → 'designer'(the designer advances the gated section)
--   punch verified    → 'designer'(closed on the designer's books)
-- p_next_court (00218 RPC arg) overrides this when the designer steers the ball
-- explicitly (e.g. R49's gc→designer verify step).
CREATE OR REPLACE FUNCTION public.next_court_for(item public.client_decisions)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE item.coordination_kind
    WHEN 'rfi'       THEN 'gc'
    WHEN 'submittal' THEN 'vendor'
    WHEN 'selection' THEN 'designer'
    WHEN 'signoff'   THEN 'designer'
    WHEN 'punch'     THEN 'designer'
    ELSE 'designer'
  END;
$$;

COMMENT ON FUNCTION public.next_court_for(public.client_decisions) IS
  'Track 5: the default court an item hands the ball to once resolved, by '
  'coordination_kind (rfi→gc, submittal→vendor, selection/signoff/punch→designer). '
  'resolve_coordination_item''s p_next_court overrides this (R49 verify step).';

-- ═══════════════════════════════════════════════════════════════════════════
-- may_resolve_coordination_item(item, actor) — authorization (R46–R49)
-- ═══════════════════════════════════════════════════════════════════════════
-- · The project's DESIGNER resolves ANY item (R46: records GC/vendor moves on
--   their behalf; R47 RFI answer; R48 submittal approve; R49 punch verify).
-- · The addressed CLIENT resolves a selection or a signoff that sits IN THEIR
--   COURT (court='client') — pick an option, e-sign a gate.
-- · GC/vendor courts are tracked, login-less in v1 (R46): no direct resolve;
--   the designer records the move. (When a party logs in later, widen here.)
CREATE OR REPLACE FUNCTION public.may_resolve_coordination_item(
  item  public.client_decisions,
  actor UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_designer BOOLEAN := false;
  v_is_client   BOOLEAN := false;
BEGIN
  IF actor IS NULL THEN
    RETURN false;
  END IF;

  -- Designer of the item (denormalized designer_id, else the relationship join).
  SELECT (COALESCE(item.designer_id, dc.designer_id) = actor)
    INTO v_is_designer
    FROM public.designer_clients dc
   WHERE dc.id = item.designer_client_id;
  v_is_designer := COALESCE(v_is_designer, false);

  -- Project-team owner is also "the designer" for resolve purposes (co-designers).
  IF NOT v_is_designer AND item.project_id IS NOT NULL THEN
    v_is_designer := EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = item.project_id AND p.designer_id = actor
    );
  END IF;

  -- R46: the designer resolves ANY item (records GC/vendor moves on their behalf).
  IF v_is_designer THEN
    RETURN true;
  END IF;

  -- Addressed client.
  SELECT (dc.client_id = actor)
    INTO v_is_client
    FROM public.designer_clients dc
   WHERE dc.id = item.designer_client_id;
  v_is_client := COALESCE(v_is_client, false);

  -- The client resolves a selection or a signoff that is IN THEIR COURT.
  IF v_is_client
     AND item.court = 'client'
     AND item.coordination_kind IN ('selection', 'signoff') THEN
    RETURN true;
  END IF;

  -- GC/vendor courts are designer-recorded in v1 (R46/R47/R48): no direct resolve.
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.may_resolve_coordination_item(public.client_decisions, UUID) IS
  'Track 5 authorization (R46–R49): the project designer resolves ANY item '
  '(recording GC/vendor moves on their behalf); the addressed client resolves a '
  'selection or signoff in their court. GC/vendor are tracked, login-less in v1 — '
  'no direct resolve. Called inside resolve_coordination_item.';

-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_coordination_item — the one-act resolve + same-tx cascade
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- submit_coordination_revision — record a submittal round (R48 revise & resubmit)
-- ═══════════════════════════════════════════════════════════════════════════
-- coordination_item_revisions is RPC-only-writable (00214: no broad write policy).
-- This is the sanctioned write path: a (designer-recorded, R46) vendor resubmit
-- adds the NEXT revision row and leaves the item status='pending' (R48) — so the
-- 00171 guard never sees revision churn and the ball stays in the designer's
-- review court. The resolve RPC's submittal branch later approves a revision id.
--
-- rev_number is computed (max+1) inside the row-lock so concurrent resubmits do
-- not collide on the UNIQUE(decision_id, rev_number). Authorization reuses
-- may_resolve_coordination_item (the designer who could resolve may record a
-- round on the vendor's behalf).
CREATE OR REPLACE FUNCTION public.submit_coordination_revision(
  p_item_id      UUID,
  p_attachments  JSONB DEFAULT '[]'::jsonb,
  p_note         TEXT  DEFAULT NULL,
  p_status       TEXT  DEFAULT 'submitted',
  p_submitted_by UUID  DEFAULT NULL
)
RETURNS public.coordination_item_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item     public.client_decisions;
  v_actor    UUID := COALESCE(p_submitted_by, auth.uid());
  v_next_rev INTEGER;
  v_rev      public.coordination_item_revisions;
BEGIN
  -- Lock the item so the rev_number computation is race-free.
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.coordination_kind <> 'submittal' THEN
    RAISE EXCEPTION 'item % is not a submittal (coordination_kind = %)',
      p_item_id, v_item.coordination_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.may_resolve_coordination_item(v_item, v_actor) THEN
    RAISE EXCEPTION 'not authorized to record a revision on item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(max(rev_number), 0) + 1
    INTO v_next_rev
    FROM public.coordination_item_revisions
   WHERE decision_id = p_item_id;

  INSERT INTO public.coordination_item_revisions (
    decision_id, rev_number, status, attachments, note, submitted_by
  ) VALUES (
    p_item_id, v_next_rev, COALESCE(p_status, 'submitted'),
    COALESCE(p_attachments, '[]'::jsonb), p_note, v_actor
  )
  RETURNING * INTO v_rev;

  -- Touch the item so it re-sorts in the margin (still pending — R48).
  UPDATE public.client_decisions SET updated_at = now() WHERE id = p_item_id;

  RETURN v_rev;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_coordination_revision(UUID, JSONB, TEXT, TEXT, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.submit_coordination_revision(UUID, JSONB, TEXT, TEXT, UUID) IS
  'Track 5 (R48): record the next submittal revision round. SECURITY DEFINER — '
  'coordination_item_revisions is RPC-only-writable. Computes rev_number under a '
  'row-lock, leaves the item status=''pending'' (the back-and-forth never churns '
  'the 00171 guard). resolve_coordination_item later approves a revision id.';

-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_coordination_item(
  p_item_id            UUID,
  p_selected_option_id UUID DEFAULT NULL,
  p_answer             TEXT DEFAULT NULL,
  p_revision_id        UUID DEFAULT NULL,
  p_next_court         TEXT DEFAULT NULL,
  p_resolved_by        UUID DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item     public.client_decisions;
  v_actor    UUID := COALESCE(p_resolved_by, auth.uid());
  v_next     TEXT;
BEGIN
  -- Row fetch + lock (serializes concurrent resolves of the same item; the
  -- delegated apply_decision has no lock of its own, so we hold the row here).
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotency: an already-resolved item is a no-op so retries are safe (the
  -- cascade already ran; re-running it would be harmless but we skip it).
  IF v_item.status = 'responded' THEN
    RETURN v_item;
  END IF;

  -- Authorization (R46–R49).
  IF NOT public.may_resolve_coordination_item(v_item, v_actor) THEN
    RAISE EXCEPTION 'not authorized to resolve coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Dispatch by workflow shape ─────────────────────────────────────────────
  IF v_item.coordination_kind = 'selection' THEN
    -- The proven path: apply_decision marks responded, selects the option, clears
    -- FF&E blocks, and feeds a winning product onto the schedule. It requires a
    -- selected option id and the item in a pre-resolve status (guaranteed: we
    -- early-returned on 'responded' above).
    IF p_selected_option_id IS NULL THEN
      RAISE EXCEPTION 'a selection item requires p_selected_option_id'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM public.apply_decision(p_item_id, p_selected_option_id, v_actor);

  ELSIF v_item.coordination_kind = 'rfi' THEN
    -- R47: record the answer; mark answered + responded.
    UPDATE public.client_decisions
       SET answer       = COALESCE(p_answer, answer),
           answered_at  = now(),
           answered_by  = v_actor,
           status       = 'responded',
           responded_at = now(),
           selected_by  = v_actor,
           updated_at   = now()
     WHERE id = p_item_id;

  ELSIF v_item.coordination_kind = 'submittal' THEN
    -- R48: approve the named revision (releasing fabrication), then resolve.
    IF p_revision_id IS NOT NULL THEN
      UPDATE public.coordination_item_revisions
         SET status      = 'approved',
             reviewed_by  = v_actor,
             reviewed_at  = now()
       WHERE id = p_revision_id
         AND decision_id = p_item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'revision % does not belong to submittal %',
          p_revision_id, p_item_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    UPDATE public.client_decisions
       SET answer       = COALESCE(p_answer, answer),
           answered_at  = now(),
           answered_by  = v_actor,
           status       = 'responded',
           responded_at = now(),
           selected_by  = v_actor,
           updated_at   = now()
     WHERE id = p_item_id;

  ELSE
    -- signoff / punch (and any future kind): record the resolution note + mark
    -- responded. (Sign-off settlement — phase advance / milestone draft — keeps
    -- its existing 00204 behavior, fired by the responded-status trigger path;
    -- R52: a phase gate UNLOCKS for the designer to advance, it does not auto-
    -- advance here.)
    UPDATE public.client_decisions
       SET answer       = COALESCE(p_answer, answer),
           answered_at  = CASE WHEN p_answer IS NOT NULL THEN now() ELSE answered_at END,
           answered_by  = CASE WHEN p_answer IS NOT NULL THEN v_actor ELSE answered_by END,
           status       = 'responded',
           responded_at = now(),
           selected_by  = v_actor,
           updated_at   = now()
     WHERE id = p_item_id;
  END IF;

  -- ── The same-tx cascade (one act, many surfaces — no deferred sync) ────────

  -- (1) Clear FF&E blocks gated by this item. (apply_decision already did this
  --     for the selection branch via blocked_by_decision_id; re-running it is a
  --     harmless no-op there, and it covers rfi/submittal/signoff/punch blockers.)
  UPDATE public.project_ffe_items
     SET blocked                = false,
         blocked_reason         = NULL,
         blocked_by_decision_id = NULL,
         last_status_change_at  = now(),
         updated_at             = now()
   WHERE blocked_by_decision_id = p_item_id
     AND project_id = v_item.project_id;

  -- (2) Flip downstream tasks blocked→todo where THIS item was the blocker and
  --     no unfinished trade-sequence predecessor remains. (A task waiting both
  --     on this item AND on an incomplete seq_after stays blocked — the read
  --     model task_blocked_state, 00219, would still mark it blocked, so we hold.)
  UPDATE public.project_tasks t
     SET status              = 'todo',
         blocked_by_item_id  = NULL,
         updated_at          = now()
   WHERE t.blocked_by_item_id = p_item_id
     AND t.status = 'blocked'
     AND (
       t.seq_after_task_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.project_tasks pre
         WHERE pre.id = t.seq_after_task_id
           AND pre.status = 'done'
       )
     );

  -- (3) Shift the ball. p_next_court (R49 verify step) overrides the default.
  v_next := COALESCE(p_next_court, public.next_court_for(v_item));
  UPDATE public.client_decisions
     SET court      = v_next,
         updated_at = now()
   WHERE id = p_item_id;

  SELECT * INTO v_item FROM public.client_decisions WHERE id = p_item_id;
  RETURN v_item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_coordination_item(UUID, UUID, TEXT, UUID, TEXT, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.resolve_coordination_item(UUID, UUID, TEXT, UUID, TEXT, UUID) IS
  'Track 5 one-act resolve (R46–R49). SECURITY DEFINER, FOR UPDATE row-lock, '
  'idempotent on status=''responded''. Authorizes via may_resolve_coordination_item, '
  'dispatches by coordination_kind (selection → apply_decision; rfi → answer; '
  'submittal → approve revision; signoff/punch → record), then in the SAME '
  'transaction clears FF&E blocks, flips downstream tasks blocked→todo (only when '
  'no unfinished seq_after remains), and shifts court via p_next_court / '
  'next_court_for. Writes NO margin/Desk row — those are views that recompute on read.';
