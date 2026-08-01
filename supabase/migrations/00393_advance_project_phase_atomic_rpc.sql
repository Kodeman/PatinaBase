-- ═══════════════════════════════════════════════════════════════════════════
-- 00393 — Atomic project-phase transition authority
--
-- The browser previously completed one project_phases row, guessed a successor
-- from sort_order, updated every row sharing that successor's phase_key, and
-- finally updated projects.current_phase in three independent requests. Any
-- failed or racing request could leave a completed phase with no live handoff.
--
-- advance_project_phase owns complete-current and resume-delayed in one locked
-- transaction. The exact follows_phase_id graph is authoritative; sort_order
-- and phase_key are never write addresses. It is a project-scoped branching
-- forest: one predecessor per phase, any number of direct followers, and edges
-- may cross render lanes. Every main-containing component owns every unfinished
-- main row; thread-only components may remain independent, while disconnected
-- completed legacy history is inert. Target ancestors must be completed and all
-- directed descendants pending. Completion activates every direct follower.
--
-- project_phases.gate_condition is descriptive legacy text and has no project-
-- runtime satisfaction state. proposal_phase_gates belongs to proposal
-- authoring and is deliberately not consulted here. Runtime phase-gate truth
-- is a pending client_decisions row on the exact phase_id where either
-- blocks_kind='phase' or blocking_status='blocks_phase'. All exact-phase
-- decisions are locked around the phase locks, and a companion trigger rejects
-- a new unresolved gate after completion.
--
-- Direct authenticated lifecycle writes are closed: new phases start pending
-- with zero progress, and status/completed_at/progress mutations require both
-- this function's current definer and its transaction-local project token.
-- Pending schedule rows remain composable/deletable; active, delayed, and
-- completed rows cannot be deleted directly. Owner maintenance sessions remain
-- available for lifecycle migrations and deterministic seed replay. Structural
-- project-boundary validation is unconditional, including for owner-written data.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.advance_project_phase(
  p_project_id      uuid,
  p_phase_id        uuid,
  p_expected_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor                 uuid := auth.uid();
  v_project               public.projects%ROWTYPE;
  v_target                public.project_phases%ROWTYPE;
  v_live_main             public.project_phases%ROWTYPE;
  v_blocker_count         integer := 0;
  v_rows                  integer := 0;
  v_component_ids         uuid[] := ARRAY[]::uuid[];
  v_component_count       integer := 0;
  v_component_edge_count  integer := 0;
  v_component_has_main    boolean := false;
  v_ancestor_ids          uuid[] := ARRAY[]::uuid[];
  v_descendant_ids        uuid[] := ARRAY[]::uuid[];
  v_direct_child_ids      uuid[] := ARRAY[]::uuid[];
  v_direct_child_count    integer := 0;
  v_direct_main_count     integer := 0;
  v_live_main_count       integer := 0;
  v_live_main_id          uuid;
  v_component_terminal    boolean := false;
  v_guard_prior           text;
  v_guard_token           text;
  v_guard_set             boolean := false;
  v_receipt               jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'advance_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expected_status NOT IN ('in_progress', 'delayed') THEN
    RAISE EXCEPTION
      'advance_project_phase expected status must be in_progress or delayed'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Parent first serializes lifecycle calls for one project. It also conflicts
  -- with FK key-share locks taken by a concurrent project_phases INSERT.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  -- Project-authoring authority is intentionally narrower than the general
  -- is_studio_comember helper: exact designer, or two active non-guest members
  -- of the same active design_studio. Contractor/manufacturer organizations do
  -- not confer project lifecycle authority.
  IF NOT FOUND OR NOT (
    v_project.designer_id = v_actor
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      JOIN public.organization_members AS owner_membership
        ON owner_membership.organization_id = actor_membership.organization_id
      JOIN public.organizations AS organization
        ON organization.id = actor_membership.organization_id
      WHERE actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND owner_membership.user_id = v_project.designer_id
        AND owner_membership.status = 'active'
        AND owner_membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status::text <> 'active' THEN
    RAISE EXCEPTION 'advance_project_phase: project is not active'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reject a cross-project phase id before taking locks in a foreign project.
  -- The row is selected again from the locked set below, so a concurrent move
  -- cannot pass the eventual project-scoped CAS.
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = p_phase_id
      AND phase.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Gate updates lock their decision row before the completed-phase guard locks
  -- its phase. Match that order here, then rescan after the phase locks. The
  -- second pass captures a decision inserted/moved into the phase while this
  -- call was waiting and prevents decision→phase / phase→decision deadlocks.
  IF p_expected_status = 'in_progress' THEN
    PERFORM decision.id
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
    ORDER BY decision.id
    FOR UPDATE;
  END IF;

  -- Freeze the complete project graph in deterministic UUID order. New child
  -- edges block on these row locks/FK key-share conflicts until this call ends.
  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases
  WHERE id = p_phase_id
    AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller's observed status is the compare-and-swap token. A retry or a
  -- second tab that wakes after the project lock must fail, never replay.
  IF v_target.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION
      'advance_project_phase: phase status changed (expected %, found %)',
      p_expected_status, v_target.status
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Cross-project edges are possible under the legacy self-FK. Check both an
  -- outbound edge from this project and an inbound foreign child before any
  -- graph inference. Cross-lane edges are intentional overlap/handoff edges.
  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS child
    JOIN public.project_phases AS parent
      ON parent.id = child.follows_phase_id
    WHERE (child.project_id = p_project_id OR parent.project_id = p_project_id)
      AND child.project_id IS DISTINCT FROM parent.project_id
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: cross-project handoff is unsupported'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Find the target's exact project-scoped connected component by walking
  -- follows edges in both directions, regardless of render lane. UNION (not
  -- UNION ALL) terminates a legacy cycle so it can be rejected explicitly.
  WITH RECURSIVE component(id) AS (
    SELECT v_target.id
    UNION
    SELECT neighbor.id
    FROM component AS component_row
    JOIN public.project_phases AS current_phase
      ON current_phase.id = component_row.id
    JOIN public.project_phases AS neighbor
      ON neighbor.project_id = p_project_id
     AND (
       neighbor.id = current_phase.follows_phase_id
       OR neighbor.follows_phase_id = current_phase.id
     )
  )
  SELECT COALESCE(array_agg(component.id ORDER BY component.id), ARRAY[]::uuid[]),
         count(*),
         COALESCE(bool_or(phase.lane = 'main'), false)
  INTO v_component_ids, v_component_count, v_component_has_main
  FROM component
  JOIN public.project_phases AS phase ON phase.id = component.id;

  SELECT count(*) INTO v_component_edge_count
  FROM public.project_phases AS phase
  WHERE phase.id = ANY(v_component_ids)
    AND phase.follows_phase_id = ANY(v_component_ids);

  IF v_component_edge_count >= v_component_count THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor chain is cyclic'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A main-containing component owns every unfinished main row. This rejects
  -- legacy pre-chain multiple-main roots without inferring or rewriting edges.
  -- Independent thread-only components remain legal, and completed disconnected
  -- main history is inert.
  IF v_component_has_main AND EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.status IN ('pending', 'in_progress', 'delayed')
      AND NOT (phase.id = ANY(v_component_ids))
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor is missing'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A phase has one predecessor, so its ancestor path is unique even when an
  -- ancestor has multiple followers. Sibling branches are deliberately absent.
  WITH RECURSIVE ancestors(id) AS (
    SELECT v_target.follows_phase_id
    WHERE v_target.follows_phase_id IS NOT NULL
    UNION
    SELECT parent.follows_phase_id
    FROM ancestors AS ancestor
    JOIN public.project_phases AS parent ON parent.id = ancestor.id
    WHERE parent.project_id = p_project_id
      AND parent.follows_phase_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_ancestor_ids
  FROM ancestors;

  -- Walk every directed follower branch. All descendants must still be pending,
  -- but only direct followers are activated by this transition.
  WITH RECURSIVE descendants(id) AS (
    SELECT child.id
    FROM public.project_phases AS child
    WHERE child.project_id = p_project_id
      AND child.follows_phase_id = v_target.id
    UNION
    SELECT child.id
    FROM descendants AS descendant
    JOIN public.project_phases AS child
      ON child.project_id = p_project_id
     AND child.follows_phase_id = descendant.id
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_descendant_ids
  FROM descendants;

  SELECT COALESCE(array_agg(child.id ORDER BY child.id), ARRAY[]::uuid[]),
         count(*),
         count(*) FILTER (WHERE child.lane = 'main')
  INTO v_direct_child_ids, v_direct_child_count, v_direct_main_count
  FROM public.project_phases AS child
  WHERE child.project_id = p_project_id
    AND child.follows_phase_id = v_target.id;

  IF v_direct_main_count > 1 THEN
    RAISE EXCEPTION 'advance_project_phase: canonical main successor is ambiguous'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = ANY(v_ancestor_ids)
      AND phase.status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: predecessor phases must be completed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = ANY(v_descendant_ids)
      AND phase.status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: successor phases must be pending'
      USING ERRCODE = 'check_violation';
  END IF;

  v_component_terminal := v_direct_child_count = 0;

  -- Rescan and lock every exact-phase coordination row after the phase locks.
  -- Only the exact pending/blocking predicate rejects; responded history does
  -- not block. New/updated late gates serialize through the companion trigger.
  IF p_expected_status = 'in_progress' THEN
    PERFORM decision.id
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
    ORDER BY decision.id
    FOR UPDATE;

    SELECT count(*) INTO v_blocker_count
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
      AND decision.status = 'pending'
      AND (
        decision.blocks_kind = 'phase'
        OR decision.blocking_status = 'blocks_phase'
      );

    IF v_blocker_count > 0 THEN
      RAISE EXCEPTION
        'advance_project_phase: % unresolved phase blocker(s)', v_blocker_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The lifecycle guard requires both the current function owner and this
  -- project+transaction token. The previous transaction-local value is restored
  -- before returning; the exception handler also restores it on every failure.
  v_guard_prior := current_setting('app.advance_project_phase_token', true);
  v_guard_token := format(
    'advance_project_phase:%s:%s',
    p_project_id,
    pg_catalog.txid_current()
  );
  PERFORM set_config('app.advance_project_phase_token', v_guard_token, true);
  v_guard_set := true;

  IF p_expected_status = 'delayed' THEN
    UPDATE public.project_phases
    SET status = 'in_progress',
        completed_at = NULL,
        updated_at = now()
    WHERE id = p_phase_id
      AND project_id = p_project_id
      AND status = 'delayed'
    RETURNING * INTO v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_project_phase: delayed phase changed during resume'
        USING ERRCODE = 'serialization_failure';
    END IF;

    v_receipt := jsonb_build_object(
      'completed_phase_id', NULL,
      'next_phase_ids', ARRAY[v_target.id]::uuid[],
      'terminal', v_component_terminal
    );
  ELSE
    -- Exact-ID CAS writes. A duplicate or NULL phase_key can never widen either
    -- UPDATE. Every direct follower is activated in the same transaction; deep
    -- descendants and sibling branches remain untouched.
    UPDATE public.project_phases
    SET status = 'completed',
        progress = 100,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_phase_id
      AND project_id = p_project_id
      AND status = 'in_progress'
    RETURNING * INTO v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_project_phase: phase changed during completion'
        USING ERRCODE = 'serialization_failure';
    END IF;

    UPDATE public.project_phases
    SET status = 'in_progress',
        completed_at = NULL,
        updated_at = now()
    WHERE id = ANY(v_direct_child_ids)
      AND project_id = p_project_id
      AND status = 'pending';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> v_direct_child_count THEN
      RAISE EXCEPTION 'advance_project_phase: successor changed during activation'
        USING ERRCODE = 'serialization_failure';
    END IF;

    v_receipt := jsonb_build_object(
      'completed_phase_id', v_target.id,
      'next_phase_ids', v_direct_child_ids,
      'terminal', v_component_terminal
    );
  END IF;

  -- projects.current_phase is a projection of locked lifecycle truth, never a
  -- transition input. Delayed counts as live. Exactly one live main phase names
  -- the pointer; none clears it; multiple live main rows make the whole phase
  -- mutation roll back rather than publishing an arbitrary/sort-derived value.
  SELECT count(*), (array_agg(phase.id ORDER BY phase.id))[1]
  INTO v_live_main_count, v_live_main_id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.lane = 'main'
    AND phase.status IN ('in_progress', 'delayed');

  IF v_live_main_count > 1 THEN
    RAISE EXCEPTION 'advance_project_phase: multiple live main phases are unsupported'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_live_main_count = 1 THEN
    SELECT * INTO STRICT v_live_main
    FROM public.project_phases
    WHERE id = v_live_main_id
      AND project_id = p_project_id;
  END IF;

  UPDATE public.projects
  SET current_phase = CASE
        WHEN v_live_main_count = 0 THEN NULL
        ELSE COALESCE(NULLIF(v_live_main.phase_key, ''), v_live_main.name)
      END,
      updated_at = now()
  WHERE id = p_project_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'advance_project_phase: project pointer update failed'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config(
    'app.advance_project_phase_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;
  RETURN v_receipt;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.advance_project_phase_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.advance_project_phase(uuid, uuid, text) IS
  'Authenticated project/studio-author phase CAS over the exact branching '
  'follows forest. Completes/resumes one target, atomically activates every '
  'direct follower on completion, and derives current_phase from locked live '
  'main truth. Returns only {completed_phase_id,next_phase_ids,terminal}; '
  'terminal is target-branch '
  'terminal, never project closeout.';

-- ─── Direct project_phases lifecycle and chain guards ──────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_phase_chain_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_project uuid;
BEGIN
  -- This is a data invariant, not an authorization boundary. Enforce it for
  -- every writer, including the table owner and SECURITY DEFINER functions.
  IF TG_OP = 'UPDATE'
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.follows_phase_id IS NOT DISTINCT FROM OLD.follows_phase_id THEN
    RETURN NEW;
  END IF;

  IF NEW.follows_phase_id IS NOT NULL THEN
    -- An UPDATE lock makes the invariant race-safe against moving the parent to
    -- another project while this child is being inserted or relinked.
    SELECT parent.project_id
    INTO v_parent_project
    FROM public.project_phases AS parent
    WHERE parent.id = NEW.follows_phase_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'project_phases predecessor must belong to the same project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.project_id IS DISTINCT FROM OLD.project_id
     AND EXISTS (
    SELECT 1
    FROM public.project_phases AS child
    WHERE child.follows_phase_id = OLD.id
      AND child.project_id IS DISTINCT FROM NEW.project_id
  ) THEN
    RAISE EXCEPTION
      'project_phases followers must remain in the same project'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_phase_chain_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_project_phase_chain_write_trg
  ON public.project_phases;
CREATE TRIGGER a_guard_project_phase_chain_write_trg
  BEFORE INSERT OR UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_phase_chain_write();

CREATE OR REPLACE FUNCTION public.guard_project_phase_lifecycle_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rpc_owner       text;
  v_project_id      uuid;
  v_expected_token  text;
  v_rpc_authorized  boolean := false;
  v_owner_maint     boolean := false;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(proc.proowner)
  INTO v_rpc_owner
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid =
    'public.advance_project_phase(uuid,uuid,text)'::pg_catalog.regprocedure;

  v_project_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  v_expected_token := format(
    'advance_project_phase:%s:%s',
    v_project_id,
    pg_catalog.txid_current()
  );
  v_rpc_authorized := current_user = v_rpc_owner
    AND current_setting('app.advance_project_phase_token', true) = v_expected_token;
  v_owner_maint := current_user = v_rpc_owner
    AND session_user = v_rpc_owner
    AND COALESCE(current_setting('role', true), 'none') = 'none';

  IF TG_OP = 'INSERT' THEN
    IF NOT (v_rpc_authorized OR v_owner_maint)
       AND (
         NEW.status IS DISTINCT FROM 'pending'
         OR NEW.completed_at IS NOT NULL
         OR NEW.progress IS DISTINCT FROM 0
       ) THEN
      RAISE EXCEPTION
        'project_phases lifecycle inserts must start pending with zero progress'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT (v_rpc_authorized OR v_owner_maint)
       AND (
         NEW.status IS DISTINCT FROM OLD.status
         OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
         OR NEW.progress IS DISTINCT FROM OLD.progress
       ) THEN
      RAISE EXCEPTION
        'project_phases lifecycle fields are writable only through advance_project_phase'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' AND NOT v_owner_maint THEN
    RAISE EXCEPTION
      'project_phases non-pending lifecycle rows cannot be deleted directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_phase_lifecycle_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS b_guard_project_phase_lifecycle_write_trg
  ON public.project_phases;
CREATE TRIGGER b_guard_project_phase_lifecycle_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_phase_lifecycle_write();

-- ─── No unresolved phase gate may arrive after phase completion ────────────

CREATE OR REPLACE FUNCTION public.guard_client_decision_completed_phase_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phase_status text;
BEGIN
  IF NEW.phase_id IS NULL
     OR NEW.status <> 'pending'
     OR NOT (
       NEW.blocks_kind = 'phase'
       OR NEW.blocking_status = 'blocks_phase'
     ) THEN
    RETURN NEW;
  END IF;

  -- Decision UPDATE already owns its decision row. advance_project_phase uses
  -- that same decision→phase order, then rescans after locking the phase graph.
  SELECT phase.status INTO v_phase_status
  FROM public.project_phases AS phase
  WHERE phase.id = NEW.phase_id
  FOR UPDATE;

  IF v_phase_status = 'completed' THEN
    RAISE EXCEPTION
      'client_decisions cannot add an unresolved blocker to a completed phase'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_completed_phase_gate()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_client_decision_completed_phase_gate_trg
  ON public.client_decisions;
CREATE TRIGGER guard_client_decision_completed_phase_gate_trg
  BEFORE INSERT OR UPDATE ON public.client_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_decision_completed_phase_gate();
