-- ═══════════════════════════════════════════════════════════════════════════
-- 00393 — Atomic project-phase transition authority
--
-- The browser previously completed one project_phases row, guessed a successor
-- from sort_order, updated every row sharing that successor's phase_key, and
-- finally updated projects.current_phase in three independent requests. Any
-- failed or racing request could leave a completed phase with no live handoff.
--
-- advance_project_phase owns the complete-current and resume-delayed acts in
-- one locked transaction. The project row is locked first, then every project
-- phase in UUID order, then the target phase's blocking coordination rows in
-- UUID order. The canonical successor is an exact same-lane follows_phase_id
-- edge; sort_order and phase_key are never write addresses. Parallel thread
-- work therefore remains live while the main lane advances.
--
-- project_phases.gate_condition is descriptive legacy text and has no project-
-- runtime satisfaction state. proposal_phase_gates belongs to proposal
-- authoring and is deliberately not consulted here. Runtime phase-gate truth
-- is the pending client_decisions relation on the exact phase_id, including
-- both the Track-5 blocks_kind='phase' spelling and the legacy
-- blocking_status='blocks_phase' spelling. A responded item unlocks; it never
-- advances automatically (00218).
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
  v_actor             uuid := auth.uid();
  v_project           public.projects%ROWTYPE;
  v_target            public.project_phases%ROWTYPE;
  v_next              public.project_phases%ROWTYPE;
  v_follower_count    integer := 0;
  v_blocker_count     integer := 0;
  v_rows              integer := 0;
  v_reachable_ids     uuid[] := ARRAY[]::uuid[];
  v_has_cycle         boolean := false;
  v_lane_terminal     boolean := false;
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

  -- Parent first: serializes every phase action for one project and prevents
  -- child INSERT/DELETE from changing the dependency set beneath this call.
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

  -- Freeze the exact schedule graph. UUID ordering gives competing calls the
  -- same lock order; the already-held project lock prevents a new FK child.
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

  -- Resume is deliberately the same authority/RPC, but it does not complete a
  -- phase or inspect completion gates. A main-lane resume restores the project
  -- display pointer; a thread resume leaves the main pointer untouched.
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

    IF v_target.lane = 'main' THEN
      UPDATE public.projects
      SET current_phase = COALESCE(NULLIF(v_target.phase_key, ''), v_target.name),
          updated_at = now()
      WHERE id = p_project_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'advance_project_phase: project pointer update failed'
          USING ERRCODE = 'serialization_failure';
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'completed_phase_id', NULL,
      'next_phase_id', v_target.id,
      'terminal', false
    );
  END IF;

  -- Completion blockers are locked after the phase graph, consistently for
  -- every caller. Only pending rows block; responded/expired rows are history.
  PERFORM decision.id
  FROM public.client_decisions AS decision
  WHERE decision.phase_id = p_phase_id
    AND decision.status = 'pending'
    AND (
      decision.blocks_kind = 'phase'
      OR decision.blocking_status = 'blocks_phase'
    )
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

  -- Resolve the target lane from follows_phase_id only. The recursive walk
  -- detects a loop explicitly, and the branch scan rejects any reachable node
  -- with multiple same-lane followers instead of guessing by sort_order.
  WITH RECURSIVE lane_walk(id, path, cycle) AS (
    SELECT v_target.id, ARRAY[v_target.id]::uuid[], false
    UNION ALL
    SELECT child.id,
           lane_walk.path || child.id,
           child.id = ANY(lane_walk.path)
    FROM lane_walk
    JOIN public.project_phases AS child
      ON child.project_id = p_project_id
     AND child.lane = v_target.lane
     AND child.follows_phase_id = lane_walk.id
    WHERE NOT lane_walk.cycle
  )
  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[]),
         COALESCE(bool_or(cycle), false)
  INTO v_reachable_ids, v_has_cycle
  FROM lane_walk;

  IF v_has_cycle THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor chain is cyclic'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS child
    WHERE child.project_id = p_project_id
      AND child.lane = v_target.lane
      AND child.follows_phase_id = ANY(v_reachable_ids)
    GROUP BY child.follows_phase_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor is ambiguous'
      USING ERRCODE = 'check_violation';
  END IF;

  -- An unfinished same-lane row outside the target's canonical descendant set
  -- is a missing/dangling handoff, not a terminal lane. Completed predecessors
  -- are intentionally allowed outside the forward walk.
  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = v_target.lane
      AND phase.id <> v_target.id
      AND phase.status IN ('pending', 'in_progress', 'delayed')
      AND NOT (phase.id = ANY(v_reachable_ids))
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor is missing'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_follower_count
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.lane = v_target.lane
    AND phase.follows_phase_id = v_target.id;

  IF v_follower_count = 1 THEN
    SELECT * INTO STRICT v_next
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = v_target.lane
      AND phase.follows_phase_id = v_target.id
    ORDER BY phase.id
    LIMIT 1;

    IF v_next.status <> 'pending' THEN
      RAISE EXCEPTION
        'advance_project_phase: canonical successor is not pending'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_lane_terminal := true;
  END IF;

  -- Exact-ID CAS writes. A duplicate or NULL phase_key can never widen either
  -- UPDATE. Any later successor/project failure rolls these writes back with
  -- the PostgreSQL statement before a receipt can be returned.
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

  IF NOT v_lane_terminal THEN
    UPDATE public.project_phases
    SET status = 'in_progress',
        completed_at = NULL,
        updated_at = now()
    WHERE id = v_next.id
      AND project_id = p_project_id
      AND status = 'pending'
    RETURNING * INTO v_next;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_project_phase: successor changed during activation'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  -- projects.current_phase describes the main lane only. A terminal main lane
  -- clears it explicitly; a thread transition (including a terminal thread)
  -- must preserve the currently displayed main phase.
  IF v_target.lane = 'main' THEN
    UPDATE public.projects
    SET current_phase = CASE
          WHEN v_lane_terminal THEN NULL
          ELSE COALESCE(NULLIF(v_next.phase_key, ''), v_next.name)
        END,
        updated_at = now()
    WHERE id = p_project_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'advance_project_phase: project pointer update failed'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completed_phase_id', v_target.id,
    'next_phase_id', CASE WHEN v_lane_terminal THEN NULL ELSE v_next.id END,
    'terminal', v_lane_terminal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.advance_project_phase(uuid, uuid, text) IS
  'Authenticated project/studio-author phase CAS. expected=in_progress '
  'completes the exact phase, rejects unresolved phase blockers, activates the '
  'unique same-lane follows_phase_id successor, and updates the main project '
  'pointer; expected=delayed resumes the exact phase. Returns only '
  '{completed_phase_id,next_phase_id,terminal}; terminal is lane-terminal, '
  'never project closeout.';
