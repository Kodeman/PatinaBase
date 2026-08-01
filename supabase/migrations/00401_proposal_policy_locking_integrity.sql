-- ============================================================================
-- 00401 — Proposal policy locking and exact-authority integrity
--
-- UPDATE/DELETE lock their target child tuple before a BEFORE ROW trigger runs.
-- The 00390 draft guard therefore cannot, by itself, impose the parent->child
-- order used by send_proposal and the canonical builder RPCs.  Acquire the
-- exact proposal parent from RLS USING before ModifyTable reaches the child,
-- remove every permissive ALL policy that could OR around that lock, and keep
-- the installed-client SELECT-only compatibility policies unchanged.
--
-- This migration also makes proposal totals database-owned and narrows both
-- document-share target families to exact design-studio authority.
-- ============================================================================

BEGIN;

-- A policy predicate must not use current_user for its actor check: inside a
-- SECURITY DEFINER function current_user is the function owner.  auth.uid()/
-- auth.role() retain the request JWT and are the exact caller boundary.
CREATE OR REPLACE FUNCTION public.lock_proposal_authored_parent(
  p_proposal_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locked_id uuid;
BEGIN
  IF p_proposal_id IS NULL
     OR auth.uid() IS NULL
     OR auth.role() IS DISTINCT FROM 'authenticated'
  THEN
    RETURN false;
  END IF;

  SELECT proposal.id
  INTO v_locked_id
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.status = 'draft'
    AND public.is_design_studio_comember(proposal.designer_id)
  FOR UPDATE;

  RETURN v_locked_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_proposal_authored_parent(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.lock_proposal_authored_parent(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.lock_proposal_authored_parent(uuid) IS
  'RLS write predicate: exact authenticated design-studio authority plus a '
  'draft proposal FOR UPDATE lock acquired before child ModifyTable locking.';

-- An UPDATE USING predicate sees OLD and can lock its parent before the child,
-- but WITH CHECK sees NEW only after the child has reached ModifyTable.  A raw
-- reparent could otherwise recreate the inverse child->new-parent edge.  The
-- shipped hooks do not reparent authored rows; canonical DEFINER workflows can
-- still copy/move them because their statements run as postgres.
CREATE OR REPLACE FUNCTION public.guard_authenticated_proposal_reparent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_proposal_id uuid;
  v_new_proposal_id uuid;
BEGIN
  IF current_user IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN (
    'proposal_items',
    'proposal_sections',
    'proposal_scope_rooms',
    'proposal_phases',
    'proposal_exclusions',
    'proposal_payment_milestones',
    'proposal_change_order_terms',
    'proposal_palettes',
    'proposal_team_members'
  ) THEN
    IF (to_jsonb(NEW)->>'proposal_id')
       IS DISTINCT FROM (to_jsonb(OLD)->>'proposal_id')
    THEN
      RAISE EXCEPTION 'proposal-owned rows cannot be directly reparented'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  ELSIF TG_TABLE_NAME IN (
    'proposal_phase_deliverables',
    'proposal_phase_gates',
    'proposal_schedule_milestones'
  ) THEN
    IF (to_jsonb(NEW)->>'phase_id')
       IS DISTINCT FROM (to_jsonb(OLD)->>'phase_id')
    THEN
      RAISE EXCEPTION 'proposal phase children cannot be directly reparented'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  ELSIF TG_TABLE_NAME = 'palette_swatches' THEN
    IF NEW.palette_id IS DISTINCT FROM OLD.palette_id THEN
      RAISE EXCEPTION 'proposal palette swatches cannot be directly reparented'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  ELSIF TG_TABLE_NAME = 'proposal_board_items' THEN
    IF NEW.board_id IS DISTINCT FROM OLD.board_id THEN
      SELECT board.proposal_id INTO v_old_proposal_id
      FROM public.proposal_boards AS board
      WHERE board.id = OLD.board_id;

      SELECT board.proposal_id INTO v_new_proposal_id
      FROM public.proposal_boards AS board
      WHERE board.id = NEW.board_id;

      -- Project-only board moves retain their historical behavior.  Crossing
      -- into, out of, or between proposal editions is an authored reparent.
      IF v_old_proposal_id IS NOT NULL OR v_new_proposal_id IS NOT NULL THEN
        RAISE EXCEPTION 'proposal board items cannot be directly reparented'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME IN ('proposal_boards', 'spec_field_defs') THEN
    IF (to_jsonb(NEW)->>'proposal_id')
       IS DISTINCT FROM (to_jsonb(OLD)->>'proposal_id')
    THEN
      RAISE EXCEPTION 'proposal-owned rows cannot be directly reparented'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  ELSIF TG_TABLE_NAME = 'document_shares' THEN
    IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
       OR NEW.spec_book_artifact_id IS DISTINCT FROM OLD.spec_book_artifact_id
    THEN
      RAISE EXCEPTION 'document shares cannot be directly retargeted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_authenticated_proposal_reparent()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_items;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_items
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_sections;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_sections
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_scope_rooms;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_scope_rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_phases;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_phases
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_phase_deliverables;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF phase_id ON public.proposal_phase_deliverables
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_phase_gates;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF phase_id ON public.proposal_phase_gates
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_schedule_milestones;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF phase_id ON public.proposal_schedule_milestones
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_exclusions;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_exclusions
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_payment_milestones;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_payment_milestones
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_change_order_terms;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_change_order_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_palettes;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_palettes
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.palette_swatches;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF palette_id ON public.palette_swatches
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_boards;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id, project_id ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_board_items;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF board_id ON public.proposal_board_items
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.proposal_team_members;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id ON public.proposal_team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.spec_field_defs;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id, project_id ON public.spec_field_defs
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

DROP TRIGGER IF EXISTS a_guard_authenticated_proposal_reparent_trg
  ON public.document_shares;
CREATE TRIGGER a_guard_authenticated_proposal_reparent_trg
BEFORE UPDATE OF proposal_id, spec_book_artifact_id ON public.document_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_authenticated_proposal_reparent();

-- 00399's legacy phase-delete rewire runs for each ON DELETE CASCADE child.
-- During a proposal-parent cascade the parent is already absent, so neither
-- rewire nor post-delete topology/total work has a surviving edition to serve.
-- Exempt only that nested, parent-absent case; direct phase DELETE remains on
-- the full authorization, lock, rewire, assertion, and total path.
CREATE OR REPLACE FUNCTION public.rewire_legacy_proposal_phase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
BEGIN
  IF pg_trigger_depth() > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.proposals AS proposal
       WHERE proposal.id = OLD.proposal_id
     )
  THEN
    RETURN OLD;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  IF TG_WHEN = 'BEFORE' THEN
    SELECT * INTO v_proposal
    FROM public.proposals
    WHERE id = OLD.proposal_id
    FOR UPDATE;
    IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
      RAISE EXCEPTION 'proposal % not found or access denied', OLD.proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal.status <> 'draft' THEN
      RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
        OLD.proposal_id, v_proposal.status
        USING ERRCODE = 'check_violation';
    END IF;

    PERFORM phase.id
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = OLD.proposal_id
    ORDER BY phase.id
    FOR UPDATE;

    UPDATE public.proposal_phases
    SET follows_phase_id = OLD.follows_phase_id,
        updated_at = now()
    WHERE proposal_id = OLD.proposal_id
      AND follows_phase_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM public._assert_proposal_phase_topology(
    OLD.proposal_id, 'legacy proposal phase delete result'
  );
  IF to_regprocedure('public._recompute_proposal_total_locked(uuid)') IS NOT NULL
  THEN
    PERFORM public._recompute_proposal_total_locked(OLD.proposal_id);
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.rewire_legacy_proposal_phase_delete()
  FROM PUBLIC, anon, authenticated, service_role;

-- Legacy proposal-total calls run immediately after an item/phase mutation and
-- ignore the PATCH result.  Treat every direct authenticated total assignment
-- as a successful no-op.  Canonical DEFINER recomputation runs as postgres and
-- is unaffected.  Returning NULL for a total-only PATCH avoids even an
-- updated_at bump.
CREATE OR REPLACE FUNCTION public.normalize_authenticated_proposal_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
  THEN
    RETURN NEW;
  END IF;

  NEW.total_amount := OLD.total_amount;

  IF (to_jsonb(NEW) - ARRAY['total_amount', 'updated_at'])
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['total_amount', 'updated_at'])
  THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_authenticated_proposal_total()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_normalize_authenticated_proposal_total_trg
  ON public.proposals;
CREATE TRIGGER a_normalize_authenticated_proposal_total_trg
BEFORE UPDATE OF total_amount ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.normalize_authenticated_proposal_total();

CREATE OR REPLACE FUNCTION public.sync_proposal_item_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid;
BEGIN
  -- Parent cascade deletion has no surviving total to maintain.
  IF TG_OP = 'DELETE'
     AND pg_trigger_depth() > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.proposals AS proposal
       WHERE proposal.id = OLD.proposal_id
     )
  THEN
    RETURN OLD;
  END IF;

  FOR v_proposal_id IN
    SELECT DISTINCT candidate.proposal_id
    FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.proposal_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.proposal_id END
    ]) AS candidate(proposal_id)
    WHERE candidate.proposal_id IS NOT NULL
    ORDER BY candidate.proposal_id
  LOOP
    PERFORM public._recompute_proposal_total_locked(v_proposal_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_proposal_item_total()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_sync_proposal_item_total_trg
  ON public.proposal_items;
CREATE TRIGGER zz_sync_proposal_item_total_trg
AFTER INSERT OR UPDATE OF line_total_cents OR DELETE ON public.proposal_items
FOR EACH ROW EXECUTE FUNCTION public.sync_proposal_item_total();

-- Remove every historical permissive write-capable policy.  PostgreSQL ORs
-- permissive policies, so leaving even one FOR ALL policy would bypass the
-- locking predicate below.  Temporary installed-client SELECT policies and
-- project-client SELECT policies are deliberately not touched.
DROP POLICY IF EXISTS "Designers can manage their proposals" ON public.proposals;
DROP POLICY IF EXISTS proposals_studio_rw ON public.proposals;

DROP POLICY IF EXISTS "Inherit proposal access" ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_studio_rw ON public.proposal_items;

DROP POLICY IF EXISTS proposal_sections_studio_rw ON public.proposal_sections;

DROP POLICY IF EXISTS "Designers manage their proposal scope rooms"
  ON public.proposal_scope_rooms;
DROP POLICY IF EXISTS proposal_scope_rooms_studio_rw ON public.proposal_scope_rooms;

DROP POLICY IF EXISTS "Designers manage their proposal phases"
  ON public.proposal_phases;
DROP POLICY IF EXISTS proposal_phases_studio_rw ON public.proposal_phases;

DROP POLICY IF EXISTS proposal_phase_deliverables_studio_rw
  ON public.proposal_phase_deliverables;
DROP POLICY IF EXISTS proposal_phase_deliverables_select
  ON public.proposal_phase_deliverables;
DROP POLICY IF EXISTS proposal_phase_deliverables_insert
  ON public.proposal_phase_deliverables;
DROP POLICY IF EXISTS proposal_phase_deliverables_update
  ON public.proposal_phase_deliverables;
DROP POLICY IF EXISTS proposal_phase_deliverables_delete
  ON public.proposal_phase_deliverables;

DROP POLICY IF EXISTS proposal_phase_gates_studio_rw
  ON public.proposal_phase_gates;
DROP POLICY IF EXISTS proposal_phase_gates_select ON public.proposal_phase_gates;
DROP POLICY IF EXISTS proposal_phase_gates_insert ON public.proposal_phase_gates;
DROP POLICY IF EXISTS proposal_phase_gates_update ON public.proposal_phase_gates;
DROP POLICY IF EXISTS proposal_phase_gates_delete ON public.proposal_phase_gates;

DROP POLICY IF EXISTS proposal_schedule_milestones_designer_all
  ON public.proposal_schedule_milestones;
DROP POLICY IF EXISTS proposal_schedule_milestones_studio_rw
  ON public.proposal_schedule_milestones;

DROP POLICY IF EXISTS "Designers manage their proposal exclusions"
  ON public.proposal_exclusions;
DROP POLICY IF EXISTS proposal_exclusions_studio_rw ON public.proposal_exclusions;

DROP POLICY IF EXISTS "Designers manage their proposal payment milestones"
  ON public.proposal_payment_milestones;
DROP POLICY IF EXISTS proposal_payment_milestones_studio_rw
  ON public.proposal_payment_milestones;

DROP POLICY IF EXISTS "Designers manage their proposal CO terms"
  ON public.proposal_change_order_terms;
DROP POLICY IF EXISTS proposal_change_order_terms_studio_rw
  ON public.proposal_change_order_terms;

DROP POLICY IF EXISTS "Designers manage their proposal palettes"
  ON public.proposal_palettes;
DROP POLICY IF EXISTS proposal_palettes_studio_rw ON public.proposal_palettes;

DROP POLICY IF EXISTS "Designers manage swatches on their palettes"
  ON public.palette_swatches;
DROP POLICY IF EXISTS palette_swatches_studio_rw ON public.palette_swatches;

DROP POLICY IF EXISTS "Designers manage their proposal boards"
  ON public.proposal_boards;
DROP POLICY IF EXISTS "Designers manage their project boards"
  ON public.proposal_boards;
DROP POLICY IF EXISTS proposal_boards_studio_rw ON public.proposal_boards;

DROP POLICY IF EXISTS "Designers manage items on their boards"
  ON public.proposal_board_items;
DROP POLICY IF EXISTS "Designers manage items on their project boards"
  ON public.proposal_board_items;
DROP POLICY IF EXISTS proposal_board_items_studio_rw
  ON public.proposal_board_items;

DROP POLICY IF EXISTS "Designer manages proposal team"
  ON public.proposal_team_members;
DROP POLICY IF EXISTS proposal_team_members_studio_rw
  ON public.proposal_team_members;

DROP POLICY IF EXISTS "Designers manage their spec field defs"
  ON public.spec_field_defs;
DROP POLICY IF EXISTS spec_field_defs_proposal_studio_rw
  ON public.spec_field_defs;

DROP POLICY IF EXISTS document_shares_designer_all ON public.document_shares;

-- ── Proposal parent ────────────────────────────────────────────────────────

CREATE POLICY proposals_design_studio_select
ON public.proposals FOR SELECT TO authenticated
USING (public.is_design_studio_comember(designer_id));

CREATE POLICY proposals_design_studio_insert
ON public.proposals FOR INSERT TO authenticated
WITH CHECK (public.is_design_studio_comember(designer_id));

CREATE POLICY proposals_design_studio_update
ON public.proposals FOR UPDATE TO authenticated
USING (public.is_design_studio_comember(designer_id))
WITH CHECK (public.is_design_studio_comember(designer_id));

CREATE POLICY proposals_design_studio_delete
ON public.proposals FOR DELETE TO authenticated
USING (public.is_design_studio_comember(designer_id));

-- ── Direct proposal children ───────────────────────────────────────────────

CREATE POLICY proposal_items_design_studio_select
ON public.proposal_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_items.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_items_design_studio_insert
ON public.proposal_items FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_items_design_studio_update
ON public.proposal_items FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_items_design_studio_delete
ON public.proposal_items FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_sections_design_studio_select
ON public.proposal_sections FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_sections.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_sections_design_studio_insert
ON public.proposal_sections FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_sections_design_studio_update
ON public.proposal_sections FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_sections_design_studio_delete
ON public.proposal_sections FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_scope_rooms_design_studio_select
ON public.proposal_scope_rooms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_scope_rooms.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_scope_rooms_design_studio_insert
ON public.proposal_scope_rooms FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_scope_rooms_design_studio_update
ON public.proposal_scope_rooms FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_scope_rooms_design_studio_delete
ON public.proposal_scope_rooms FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_phases_design_studio_select
ON public.proposal_phases FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_phases.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_phases_design_studio_insert
ON public.proposal_phases FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_phases_design_studio_update
ON public.proposal_phases FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_phases_design_studio_delete
ON public.proposal_phases FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_exclusions_design_studio_select
ON public.proposal_exclusions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_exclusions.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_exclusions_design_studio_insert
ON public.proposal_exclusions FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_exclusions_design_studio_update
ON public.proposal_exclusions FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_exclusions_design_studio_delete
ON public.proposal_exclusions FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_payment_milestones_design_studio_select
ON public.proposal_payment_milestones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_payment_milestones.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_payment_milestones_design_studio_insert
ON public.proposal_payment_milestones FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_payment_milestones_design_studio_update
ON public.proposal_payment_milestones FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_payment_milestones_design_studio_delete
ON public.proposal_payment_milestones FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_change_order_terms_design_studio_select
ON public.proposal_change_order_terms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_change_order_terms.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_change_order_terms_design_studio_insert
ON public.proposal_change_order_terms FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_change_order_terms_design_studio_update
ON public.proposal_change_order_terms FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_change_order_terms_design_studio_delete
ON public.proposal_change_order_terms FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_palettes_design_studio_select
ON public.proposal_palettes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_palettes.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_palettes_design_studio_insert
ON public.proposal_palettes FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_palettes_design_studio_update
ON public.proposal_palettes FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_palettes_design_studio_delete
ON public.proposal_palettes FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_team_members_design_studio_select
ON public.proposal_team_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_team_members.proposal_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_team_members_design_studio_insert
ON public.proposal_team_members FOR INSERT TO authenticated
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_team_members_design_studio_update
ON public.proposal_team_members FOR UPDATE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id))
WITH CHECK (public.lock_proposal_authored_parent(proposal_id));

CREATE POLICY proposal_team_members_design_studio_delete
ON public.proposal_team_members FOR DELETE TO authenticated
USING (public.lock_proposal_authored_parent(proposal_id));

-- ── Phase-parented authored children ───────────────────────────────────────

CREATE POLICY proposal_phase_deliverables_design_studio_select
ON public.proposal_phase_deliverables FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_phase_deliverables_design_studio_insert
ON public.proposal_phase_deliverables FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_phase_deliverables_design_studio_update
ON public.proposal_phase_deliverables FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_phase_deliverables_design_studio_delete
ON public.proposal_phase_deliverables FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_phase_gates_design_studio_select
ON public.proposal_phase_gates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_phase_gates_design_studio_insert
ON public.proposal_phase_gates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_phase_gates_design_studio_update
ON public.proposal_phase_gates FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_phase_gates_design_studio_delete
ON public.proposal_phase_gates FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_schedule_milestones_design_studio_select
ON public.proposal_schedule_milestones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY proposal_schedule_milestones_design_studio_insert
ON public.proposal_schedule_milestones FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_schedule_milestones_design_studio_update
ON public.proposal_schedule_milestones FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

CREATE POLICY proposal_schedule_milestones_design_studio_delete
ON public.proposal_schedule_milestones FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_phases AS phase
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.lock_proposal_authored_parent(phase.proposal_id)
  )
);

-- ── Palette-parented authored children ─────────────────────────────────────

CREATE POLICY palette_swatches_design_studio_select
ON public.palette_swatches FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_palettes AS palette
    JOIN public.proposals AS proposal ON proposal.id = palette.proposal_id
    WHERE palette.id = palette_swatches.palette_id
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

CREATE POLICY palette_swatches_design_studio_insert
ON public.palette_swatches FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_palettes AS palette
    WHERE palette.id = palette_swatches.palette_id
      AND public.lock_proposal_authored_parent(palette.proposal_id)
  )
);

CREATE POLICY palette_swatches_design_studio_update
ON public.palette_swatches FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_palettes AS palette
    WHERE palette.id = palette_swatches.palette_id
      AND public.lock_proposal_authored_parent(palette.proposal_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_palettes AS palette
    WHERE palette.id = palette_swatches.palette_id
      AND public.lock_proposal_authored_parent(palette.proposal_id)
  )
);

CREATE POLICY palette_swatches_design_studio_delete
ON public.palette_swatches FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_palettes AS palette
    WHERE palette.id = palette_swatches.palette_id
      AND public.lock_proposal_authored_parent(palette.proposal_id)
  )
);

-- ── Mixed proposal/project boards ──────────────────────────────────────────

CREATE POLICY proposal_boards_studio_select
ON public.proposal_boards FOR SELECT TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.proposals AS proposal
      WHERE proposal.id = proposal_boards.proposal_id
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = proposal_boards.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY proposal_boards_studio_insert
ON public.proposal_boards FOR INSERT TO authenticated
WITH CHECK (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = proposal_boards.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY proposal_boards_studio_update
ON public.proposal_boards FOR UPDATE TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = proposal_boards.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
)
WITH CHECK (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = proposal_boards.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY proposal_boards_studio_delete
ON public.proposal_boards FOR DELETE TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = proposal_boards.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY proposal_board_items_studio_select
ON public.proposal_board_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = proposal_board_items.board_id
      AND (
        (
          board.proposal_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.proposals AS proposal
            WHERE proposal.id = board.proposal_id
              AND public.is_design_studio_comember(proposal.designer_id)
          )
        )
        OR (
          board.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = board.project_id
              AND public.is_studio_comember(project.designer_id)
          )
        )
      )
  )
);

CREATE POLICY proposal_board_items_studio_insert
ON public.proposal_board_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = proposal_board_items.board_id
      AND (
        (
          board.proposal_id IS NOT NULL
          AND public.lock_proposal_authored_parent(board.proposal_id)
        )
        OR (
          board.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = board.project_id
              AND public.is_studio_comember(project.designer_id)
          )
        )
      )
  )
);

CREATE POLICY proposal_board_items_studio_update
ON public.proposal_board_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = proposal_board_items.board_id
      AND (
        (
          board.proposal_id IS NOT NULL
          AND public.lock_proposal_authored_parent(board.proposal_id)
        )
        OR (
          board.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = board.project_id
              AND public.is_studio_comember(project.designer_id)
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = proposal_board_items.board_id
      AND (
        (
          board.proposal_id IS NOT NULL
          AND public.lock_proposal_authored_parent(board.proposal_id)
        )
        OR (
          board.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = board.project_id
              AND public.is_studio_comember(project.designer_id)
          )
        )
      )
  )
);

CREATE POLICY proposal_board_items_studio_delete
ON public.proposal_board_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = proposal_board_items.board_id
      AND (
        (
          board.proposal_id IS NOT NULL
          AND public.lock_proposal_authored_parent(board.proposal_id)
        )
        OR (
          board.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = board.project_id
              AND public.is_studio_comember(project.designer_id)
          )
        )
      )
  )
);

-- ── Mixed proposal/project specification definitions ──────────────────────

CREATE POLICY spec_field_defs_studio_select
ON public.spec_field_defs FOR SELECT TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.proposals AS proposal
      WHERE proposal.id = spec_field_defs.proposal_id
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = spec_field_defs.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY spec_field_defs_studio_insert
ON public.spec_field_defs FOR INSERT TO authenticated
WITH CHECK (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = spec_field_defs.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY spec_field_defs_studio_update
ON public.spec_field_defs FOR UPDATE TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = spec_field_defs.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
)
WITH CHECK (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = spec_field_defs.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

CREATE POLICY spec_field_defs_studio_delete
ON public.spec_field_defs FOR DELETE TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND public.lock_proposal_authored_parent(proposal_id)
  )
  OR (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = spec_field_defs.project_id
        AND public.is_studio_comember(project.designer_id)
    )
  )
);

-- ── Document shares: read by exact studio, mutate only through RPCs ─────────

CREATE POLICY document_shares_design_studio_select
ON public.document_shares FOR SELECT TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.proposals AS proposal
      WHERE proposal.id = document_shares.proposal_id
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  )
  OR (
    spec_book_artifact_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.spec_book_artifacts AS artifact
      JOIN public.spec_book_revisions AS revision
        ON revision.id = artifact.revision_id
      JOIN public.spec_books AS book ON book.id = revision.spec_book_id
      JOIN public.projects AS project ON project.id = book.project_id
      WHERE artifact.id = document_shares.spec_book_artifact_id
        AND public.is_design_studio_comember(project.designer_id)
    )
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_shares
  FROM anon, authenticated;

-- The RLS change cannot constrain SECURITY DEFINER share functions.  Rebase
-- both spec-book creation and cross-target revocation onto the same exact
-- design-studio predicate.  CREATE OR REPLACE preserves signatures, owners,
-- comments, and the existing EXECUTE grants.
CREATE OR REPLACE FUNCTION public.create_spec_book_share(
  p_artifact_id uuid,
  p_label text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_artifact public.spec_book_artifacts;
  v_revision public.spec_book_revisions;
  v_designer_id uuid;
  v_token text;
  v_hash text;
  v_share_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT artifact.*
  INTO v_artifact
  FROM public.spec_book_artifacts AS artifact
  JOIN public.spec_book_revisions AS revision
    ON revision.id = artifact.revision_id
  JOIN public.spec_books AS book ON book.id = revision.spec_book_id
  JOIN public.projects AS project ON project.id = book.project_id
  JOIN public.project_documents AS document
    ON document.id = artifact.project_document_id
  WHERE artifact.id = p_artifact_id
    AND artifact.status = 'ready'
    AND revision.status = 'issued'
    AND document.status = 'ready';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ready issued artifact not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT revision.* INTO v_revision
  FROM public.spec_book_revisions AS revision
  WHERE revision.id = v_artifact.revision_id;

  SELECT project.designer_id INTO v_designer_id
  FROM public.spec_books AS book
  JOIN public.projects AS project ON project.id = book.project_id
  WHERE book.id = v_revision.spec_book_id;

  IF NOT public.is_design_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION 'ready issued artifact not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.document_shares (
    proposal_id,
    spec_book_artifact_id,
    token_hash,
    label,
    visibility,
    status,
    expires_at,
    created_by
  )
  VALUES (
    NULL,
    p_artifact_id,
    v_hash,
    NULLIF(btrim(p_label), ''),
    jsonb_build_object(
      'audience', v_artifact.audience,
      'format', v_artifact.format
    ),
    'active',
    p_expires_at,
    auth.uid()
  )
  RETURNING id INTO v_share_id;

  RETURN jsonb_build_object(
    'id', v_share_id,
    'token', v_token,
    'artifactId', p_artifact_id,
    'audience', v_artifact.audience,
    'expiresAt', p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_document_share(p_share_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.document_shares AS share
  SET status = 'revoked'
  WHERE share.id = p_share_id
    AND (
      (
        share.proposal_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.proposals AS proposal
          WHERE proposal.id = share.proposal_id
            AND public.is_design_studio_comember(proposal.designer_id)
        )
      )
      OR (
        share.spec_book_artifact_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.spec_book_artifacts AS artifact
          JOIN public.spec_book_revisions AS revision
            ON revision.id = artifact.revision_id
          JOIN public.spec_books AS book ON book.id = revision.spec_book_id
          JOIN public.projects AS project ON project.id = book.project_id
          WHERE artifact.id = share.spec_book_artifact_id
            AND public.is_design_studio_comember(project.designer_id)
        )
      )
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'share not found or not owned'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN true;
END;
$$;

COMMIT;
