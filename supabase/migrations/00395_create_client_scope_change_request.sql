-- ═══════════════════════════════════════════════════════════════════════════
-- 00395 — Client scope-change capture is authoritative and closure-aware
--
-- The client portal previously inserted public.scope_change_requests directly.
-- No client INSERT policy exists, so the path failed under RLS; its browser-side
-- project-status preflight also could not close the race with project closeout.
--
-- This authenticated SECURITY DEFINER boundary locks the owned project, rejects
-- completed/archived work, creates the sent request, and writes the designer's
-- activity line in one transaction. It returns a narrow receipt rather than a
-- business-table row. Direct client INSERT remains unavailable.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_client_scope_change_request(
  p_project_id uuid,
  p_title text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_designer_client_id uuid;
  v_actor_name text;
  v_title text := btrim(COALESCE(p_title, ''));
  v_description text := btrim(COALESCE(p_description, ''));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'create_client_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_title = '' OR v_description = '' THEN
    RAISE EXCEPTION
      'create_client_scope_change_request: title and description are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The row lock serializes this act with close_project's project update. Once
  -- this check passes, the project cannot become completed before our INSERT
  -- commits; if closeout won the lock first, this request is rejected.
  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_project.client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION
      'create_client_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION
      'create_client_scope_change_request: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scope_change_requests (
    project_id,
    proposal_id,
    requested_by,
    title,
    description,
    additional_ffe_budget_cents,
    additional_design_fee_cents,
    timeline_impact_weeks,
    new_total_budget_cents,
    new_rooms,
    new_ffe_items,
    status,
    sent_at
  )
  VALUES (
    v_project.id,
    v_project.proposal_id,
    v_actor,
    v_title,
    v_description,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    '[]'::jsonb,
    'sent',
    now()
  )
  RETURNING * INTO v_request;

  -- Prefer the relationship that opened this project. Older/direct projects
  -- may not carry a proposal, so fall back to the canonical non-lead pair.
  IF v_project.proposal_id IS NOT NULL THEN
    SELECT proposal.designer_client_id
    INTO v_designer_client_id
    FROM public.proposals AS proposal
    WHERE proposal.id = v_project.proposal_id;
  END IF;

  IF v_designer_client_id IS NULL THEN
    SELECT relationship.id
    INTO v_designer_client_id
    FROM public.designer_clients AS relationship
    WHERE relationship.designer_id = v_project.designer_id
      AND relationship.client_id = v_actor
      AND relationship.status <> 'lead'
    ORDER BY relationship.updated_at DESC NULLS LAST,
             relationship.created_at DESC,
             relationship.id
    LIMIT 1;
  END IF;

  IF v_designer_client_id IS NOT NULL THEN
    SELECT profile.full_name
    INTO v_actor_name
    FROM public.profiles AS profile
    WHERE profile.id = v_actor;

    INSERT INTO public.client_activity_log (
      designer_client_id,
      activity_type,
      title,
      description,
      metadata,
      actor_name
    )
    VALUES (
      v_designer_client_id,
      'scope_change_requested',
      'Client requested change: ' || v_title,
      left(v_description, 500),
      jsonb_build_object(
        'project_id', v_project.id,
        'change_id', v_request.id
      ),
      v_actor_name
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status,
    'sent_at', v_request.sent_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_scope_change_request(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_scope_change_request(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_client_scope_change_request(uuid, text, text) IS
  '00395: authenticated client-only, project-locked scope-change capture. '
  'Rejects completed/archived projects, writes the sent request and activity '
  'line atomically, and returns {id, project_id, status, sent_at}.';
