-- ═══════════════════════════════════════════════════════════════════════════
-- 00399 — End-to-end journey authority and terminal integrity
--
-- The client-journey adversarial pass found eight places where row visibility
-- (RLS) was being mistaken for authority over irreversible business truth.
-- This migration makes those writes capability-owned and row-locked:
--   • activated project identity cannot diverge from its proposal relationship;
--   • completed/archived projects cannot be reopened by direct UPDATE;
--   • Brief → Discovery accepts only an exact active design-studio peer;
--   • decision identity, business payload, options, and lifecycle move through
--     checked RPCs rather than broad authenticated UPDATE/DELETE grants;
--   • proposal feedback/nudge metadata require their exact canonical acts;
--   • signatures bind the exact proposal.designer_client_id relationship;
--   • closeout sums paid split invoice lines for each FF&E item.
--
-- Whole-body lineage for redefined functions:
--   begin_discovery:          00386 → 00399
--   apply_decision:           00085 → 00175 → 00185 → 00399
--   resolve_coordination_item:00218 → 00399
--   submit_coordination_revision: 00218 → 00399
--   sign_proposal:            00210 → 00387 → 00390 → 00399
--   record_offline_signature: 00254 → 00387 → 00399
--   close_project:            00238 → 00383 → 00387 → 00394 → 00399
--   nudge_proposal:           00231 → 00399
--   request_proposal_change:  00210 → 00399
--
-- app.client_decision_write_id / app.client_decision_insert_id and the
-- proposal metadata GUCs are transaction-local and row-scoped. An API caller
-- may set an arbitrary custom GUC, but cannot also become postgres, which is
-- the independent fact required by the SECURITY INVOKER table guards.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Project terminal + activated-identity boundary ─────────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_terminal_identity_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'archived'
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'terminal project status is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'completed'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       NEW.status = 'archived'
       AND current_user IS NOT DISTINCT FROM 'postgres'
       AND current_setting('app.project_archive_id', true)
           IS NOT DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION 'completed projects may only move to the archive'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (
       NEW.closure_checklist IS DISTINCT FROM OLD.closure_checklist
       OR NEW.portfolio_snapshot IS DISTINCT FROM OLD.portfolio_snapshot
     )
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_completion_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION 'project closeout evidence may only change through close_project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'archived'
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_archive_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION 'projects may only enter archived through archive_project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('active', 'on_hold')
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_operational_status_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'project hold and resume transitions require set_project_operational_status'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.designer_id IS DISTINCT FROM OLD.designer_id
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_reassignment_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION 'project lead may only change through reassign_project_lead'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The proposal designer is historical provenance after an authorized lead
  -- transfer. The proposal/client relationship itself never changes: a project
  -- update must still preserve the source proposal, source designer, and client.
  IF NEW.proposal_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.proposals AS proposal
       JOIN public.designer_clients AS relationship
         ON relationship.id = proposal.designer_client_id
       WHERE proposal.id = NEW.proposal_id
         AND proposal.project_id IS NOT DISTINCT FROM NEW.id
         AND proposal.client_id IS NOT DISTINCT FROM NEW.client_id
         AND relationship.designer_id IS NOT DISTINCT FROM proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM proposal.client_id
     )
  THEN
    RAISE EXCEPTION
      'activated project client must match its proposal relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_terminal_identity_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_project_terminal_identity_integrity_trg
  ON public.projects;
CREATE TRIGGER guard_project_terminal_identity_integrity_trg
BEFORE UPDATE OF
  status, client_id, designer_id, proposal_id,
  closure_checklist, portfolio_snapshot
ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_terminal_identity_integrity();

COMMENT ON FUNCTION public.guard_project_terminal_identity_integrity() IS
  'Independent project table boundary: terminal state/evidence, archive/hold '
  'transitions, and lead reassignment require exact row-scoped capabilities; '
  'proposal-backed projects always preserve their historical relationship.';

CREATE OR REPLACE FUNCTION public.guard_project_closeout_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres'
     AND (
       NEW.closure_checklist IS NOT NULL
       OR NEW.portfolio_snapshot IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'project closeout evidence may only be created by close_project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_closeout_evidence_insert()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_project_closeout_evidence_insert_trg
  ON public.projects;
CREATE TRIGGER guard_project_closeout_evidence_insert_trg
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_closeout_evidence_insert();

CREATE OR REPLACE FUNCTION public.set_project_operational_status(
  p_project_id uuid,
  p_expected_status public.project_status,
  p_status public.project_status
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_project_operational_status requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('active', 'on_hold') THEN
    RAISE EXCEPTION 'operational status must be active or on_hold'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'project % changed since it was loaded', p_project_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_project.status = p_status THEN
    RETURN v_project;
  END IF;
  IF (v_project.status, p_status) NOT IN (
    ('active'::public.project_status, 'on_hold'::public.project_status),
    ('on_hold'::public.project_status, 'active'::public.project_status)
  ) THEN
    RAISE EXCEPTION 'project % cannot move from % to %',
      p_project_id, v_project.status, p_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.project_operational_status_id', p_project_id::text, true);
  UPDATE public.projects
  SET status = p_status, updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_operational_status_id', '', true);
  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_operational_status(
  uuid, public.project_status, public.project_status
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_project_operational_status(
  uuid, public.project_status, public.project_status
) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_project(
  p_project_id uuid,
  p_expected_status public.project_status
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'archive_project requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status = 'archived' THEN
    RETURN v_project;
  END IF;
  IF v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'project % changed since it was loaded', p_project_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_project.status NOT IN ('active', 'on_hold', 'completed') THEN
    RAISE EXCEPTION 'project % cannot be archived from status %',
      p_project_id, v_project.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.project_archive_id', p_project_id::text, true);
  UPDATE public.projects
  SET status = 'archived', updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_archive_id', '', true);
  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_project(uuid, public.project_status)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.archive_project(uuid, public.project_status)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reassign_project_lead(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_new_designer_id uuid
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_old_relationship public.designer_clients%ROWTYPE;
  v_new_relationship_id uuid;
  v_studio_id uuid;
  v_actor_name text;
  v_decision record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'reassign_project_lead requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id IS NULL THEN
    RAISE EXCEPTION 'a new lead designer is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.designer_id IS DISTINCT FROM p_expected_designer_id THEN
    RAISE EXCEPTION 'project % lead changed since it was loaded', p_project_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'terminal project lead is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT organization.id INTO v_studio_id
    FROM public.organizations AS organization
    JOIN public.organization_members AS old_membership
      ON old_membership.organization_id = organization.id
    JOIN public.organization_members AS new_membership
      ON new_membership.organization_id = organization.id
    WHERE organization.id = v_project.studio_id
      AND old_membership.user_id = v_project.designer_id
      AND old_membership.status = 'active'
      AND old_membership.role <> 'guest'
      AND new_membership.user_id = p_new_designer_id
      AND new_membership.status = 'active'
      AND new_membership.role <> 'guest'
      AND organization.type = 'design_studio'
      AND organization.status = 'active'
      AND (
        v_actor = v_project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.organization_members AS actor_membership
          WHERE actor_membership.organization_id = organization.id
            AND actor_membership.user_id = v_actor
            AND actor_membership.status = 'active'
            AND actor_membership.role IN ('owner', 'admin')
        )
      )
    ORDER BY organization.id
    LIMIT 1;

  IF v_studio_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = p_new_designer_id AND is_designer IS TRUE
     )
  THEN
    RAISE EXCEPTION
      'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id = v_project.designer_id THEN
    RETURN v_project;
  END IF;

  SELECT * INTO v_old_relationship
  FROM public.designer_clients
  WHERE (
      v_project.proposal_id IS NOT NULL
      AND id = (
        SELECT proposal.designer_client_id
        FROM public.proposals AS proposal
        WHERE proposal.id = v_project.proposal_id
      )
    ) OR (
      v_project.proposal_id IS NULL
      AND designer_id = v_project.designer_id
      AND client_id = v_project.client_id
    )
  ORDER BY (status <> 'lead') DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project has no canonical designer-client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.designer_clients (
    designer_id, client_id, client_name, client_email, nickname,
    status, source, first_project_at, last_project_at
  ) VALUES (
    p_new_designer_id, v_project.client_id,
    v_old_relationship.client_name, v_old_relationship.client_email,
    v_old_relationship.nickname, 'active',
    COALESCE(v_old_relationship.source, 'direct'),
    COALESCE(v_old_relationship.first_project_at, now()), now()
  )
  ON CONFLICT (designer_id, client_id)
    WHERE client_id IS NOT NULL AND status <> 'lead'
  DO UPDATE SET last_project_at = now(), updated_at = now()
  RETURNING id INTO v_new_relationship_id;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, v_project.designer_id, 'previous_lead', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL, assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  UPDATE public.project_team_members
  SET removed_at = now(), updated_at = now()
  WHERE project_id = p_project_id
    AND user_id = v_project.designer_id
    AND role = 'lead_designer'
    AND removed_at IS NULL;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, p_new_designer_id, 'lead_designer', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL, assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.client_activity_log (
    designer_client_id, activity_type, title, metadata, actor_name
  ) VALUES (
    v_old_relationship.id, 'lead_reassigned', 'Lead designer reassigned',
    jsonb_build_object(
      'project_id', p_project_id,
      'old_designer_id', v_project.designer_id,
      'new_designer_id', p_new_designer_id
    ),
    COALESCE(v_actor_name, 'Unknown')
  );

  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values, metadata
  ) VALUES (
    v_actor, v_studio_id, 'project.lead_reassigned', 'project', p_project_id,
    jsonb_build_object('designer_id', v_project.designer_id),
    jsonb_build_object('designer_id', p_new_designer_id),
    jsonb_build_object('via', 'reassign_project_lead')
  );

  PERFORM set_config('app.project_reassignment_id', p_project_id::text, true);
  UPDATE public.projects
  SET designer_id = p_new_designer_id, updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_reassignment_id', '', true);

  -- Proposal approvals retain the source proposal relationship as historical
  -- evidence. Other project decisions follow the current lead atomically.
  FOR v_decision IN
    SELECT id
    FROM public.client_decisions
    WHERE project_id = p_project_id
      AND linked_proposal_id IS NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_decision.id::text, true);
    UPDATE public.client_decisions
    SET designer_id = p_new_designer_id,
        designer_client_id = v_new_relationship_id,
        updated_at = now()
    WHERE id = v_decision.id;
  END LOOP;
  PERFORM set_config('app.client_decision_write_id', '', true);

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_project_lead(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_project_lead(uuid, uuid, uuid)
  TO authenticated;

-- ── Brief → Discovery exact design-studio authority ────────────────────────

CREATE OR REPLACE FUNCTION public.begin_discovery(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'begin_discovery requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  -- _can_author_proposal is the canonical exact-author helper: owner, or two
  -- active non-guest memberships in the same active design_studio. The older
  -- is_studio_comember helper intentionally includes other organization types.
  IF NOT FOUND OR NOT public._can_author_proposal(v_lead.designer_id) THEN
    RAISE EXCEPTION 'lead % not found or access denied', p_lead_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_lead.status NOT IN ('new', 'viewed', 'contacted', 'accepted') THEN
    RAISE EXCEPTION 'lead % cannot begin discovery from status %',
      p_lead_id, v_lead.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.leads
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  -- The lead_id is the durable idempotency key. A later invite or proposal can
  -- legitimately link a profile and advance this relationship beyond `lead`;
  -- retries must return that exact progressed row without normalizing it back.
  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE designer_id = v_lead.designer_id
    AND lead_id = p_lead_id
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'lead', to_jsonb(v_lead),
      'designerClientId', v_relationship.id
    );
  END IF;

  IF v_lead.homeowner_id IS NOT NULL THEN
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND client_id = v_lead.homeowner_id
      AND status = 'lead'
      AND lead_id IS NULL
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.designer_clients
      SET source = 'lead',
          lead_id = p_lead_id,
          updated_at = now()
      WHERE id = v_relationship.id
      RETURNING * INTO v_relationship;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, v_lead.homeowner_id, 'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  ELSE
    IF v_lead.contact_email IS NOT NULL THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_email = v_lead.contact_email
        AND client_id IS NULL
        AND lead_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      IF v_relationship.status = 'lead' THEN
        UPDATE public.designer_clients
        SET client_name = v_lead.contact_name,
            client_email = v_lead.contact_email,
            source = 'lead',
            lead_id = p_lead_id,
            updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      ELSE
        -- A pre-existing progressed direct contact may be associated with this
        -- lead, but Discovery never rewinds its identity or lifecycle state.
        UPDATE public.designer_clients
        SET lead_id = p_lead_id, updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      END IF;
    ELSIF v_lead.contact_email IS NOT NULL THEN
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,
        'lead', p_lead_id, 'lead'
      )
      ON CONFLICT (designer_id, client_email)
        WHERE client_email IS NOT NULL AND client_id IS NULL
      DO UPDATE SET
        client_name = CASE
          WHEN designer_clients.status = 'lead' THEN EXCLUDED.client_name
          ELSE designer_clients.client_name
        END,
        source = CASE
          WHEN designer_clients.status = 'lead' THEN 'lead'
          ELSE designer_clients.source
        END,
        lead_id = EXCLUDED.lead_id,
        updated_at = now()
      WHERE designer_clients.lead_id IS NULL
         OR designer_clients.lead_id = EXCLUDED.lead_id
      RETURNING * INTO v_relationship;
      IF v_relationship.id IS NULL THEN
        RAISE EXCEPTION 'contact email is already claimed by another lead'
          USING ERRCODE = 'unique_violation';
      END IF;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, NULL,
        'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'designerClientId', v_relationship.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_discovery(uuid) TO authenticated;

COMMENT ON FUNCTION public.begin_discovery(uuid) IS
  'Atomic Brief→Discovery transition. The exact designer or an active '
  'non-guest peer in the same active design_studio may act; contractor, '
  'manufacturer, inactive, and guest co-memberships confer no authority.';

-- Arrival Ceremony requires a real recipient because its threshold act creates
-- a direct thread and recipient-addressed notifications. Preserve the shipped
-- implementation as a private core and put the eligibility check before it so
-- a captured profileless lead takes begin_discovery instead of dead-ending.
DO $$
BEGIN
  IF to_regprocedure(
       'public._accept_design_request_profile_bound_core(uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.accept_design_request(uuid)
      RENAME TO _accept_design_request_profile_bound_core;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._accept_design_request_profile_bound_core(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_design_request(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_homeowner_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_actor AND is_designer IS TRUE
  ) THEN
    RAISE EXCEPTION 'not_designer' USING DETAIL = v_actor::text;
  END IF;

  SELECT homeowner_id INTO v_homeowner_id
  FROM public.leads
  WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING DETAIL = p_lead_id::text;
  END IF;
  IF v_homeowner_id IS NULL THEN
    RAISE EXCEPTION 'arrival_requires_client_profile'
      USING DETAIL = 'captured profileless leads must begin Discovery directly';
  END IF;

  RETURN public._accept_design_request_profile_bound_core(p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_design_request(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_design_request(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.hydrate_lead_relationship_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_name text;
  v_contact_email text;
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND (NEW.client_name IS NULL OR NEW.client_email IS NULL)
  THEN
    SELECT contact_name, contact_email
    INTO v_contact_name, v_contact_email
    FROM public.leads
    WHERE id = NEW.lead_id
      AND designer_id IS NOT DISTINCT FROM NEW.designer_id;

    NEW.client_name := COALESCE(NEW.client_name, v_contact_name);
    NEW.client_email := COALESCE(NEW.client_email, v_contact_email);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hydrate_lead_relationship_contact()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS hydrate_lead_relationship_contact_trg
  ON public.designer_clients;
CREATE TRIGGER hydrate_lead_relationship_contact_trg
BEFORE INSERT OR UPDATE OF lead_id, designer_id, client_name, client_email
ON public.designer_clients
FOR EACH ROW EXECUTE FUNCTION public.hydrate_lead_relationship_contact();

UPDATE public.designer_clients AS relationship
SET client_name = COALESCE(relationship.client_name, lead.contact_name),
    client_email = COALESCE(relationship.client_email, lead.contact_email),
    updated_at = now()
FROM public.leads AS lead
WHERE lead.id = relationship.lead_id
  AND lead.designer_id IS NOT DISTINCT FROM relationship.designer_id
  AND (
    (relationship.client_name IS NULL AND lead.contact_name IS NOT NULL)
    OR (relationship.client_email IS NULL AND lead.contact_email IS NOT NULL)
  );

-- ── Proposal feedback + nudge metadata table authority ─────────────────────

CREATE OR REPLACE FUNCTION public.guard_proposal_feedback_nudge_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IS DISTINCT FROM 'postgres'
       AND (NEW.last_nudged_at IS NOT NULL OR NEW.nudge_count <> 0)
    THEN
      RAISE EXCEPTION
        'proposal nudge state cannot be preloaded'
        USING ERRCODE = 'check_violation';
    END IF;

    -- clone_proposal is SECURITY INVOKER and carries the client's prior
    -- feedback into a draft revision. Permit only an exact value already
    -- present on the same relationship and root chain; a direct INSERT still
    -- cannot invent client-authored feedback.
    IF current_user IS DISTINCT FROM 'postgres'
       AND NEW.client_feedback IS NOT NULL
       AND (
         NEW.status <> 'draft'
         OR NEW.parent_proposal_id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM public.proposals AS source
           WHERE (
             source.id = NEW.parent_proposal_id
             OR source.parent_proposal_id = NEW.parent_proposal_id
           )
             AND source.designer_id IS NOT DISTINCT FROM NEW.designer_id
             AND source.client_id IS NOT DISTINCT FROM NEW.client_id
             AND source.designer_client_id
                   IS NOT DISTINCT FROM NEW.designer_client_id
             AND source.client_feedback IS NOT DISTINCT FROM NEW.client_feedback
         )
       )
    THEN
      RAISE EXCEPTION
        'proposal client feedback may only be copied from its revision chain'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.client_feedback IS DISTINCT FROM OLD.client_feedback
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_feedback_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'proposal client feedback may only change through request_proposal_change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.last_nudged_at IS DISTINCT FROM OLD.last_nudged_at
     OR NEW.nudge_count IS DISTINCT FROM OLD.nudge_count
  THEN
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_nudge_id', true)
          IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION
        'proposal nudge state may only change through nudge_proposal'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_feedback_nudge_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_proposal_feedback_nudge_authority_insert_trg
  ON public.proposals;
DROP TRIGGER IF EXISTS guard_proposal_feedback_nudge_authority_trg
  ON public.proposals;
CREATE TRIGGER guard_proposal_feedback_nudge_authority_insert_trg
BEFORE INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_feedback_nudge_authority();
CREATE TRIGGER guard_proposal_feedback_nudge_authority_trg
BEFORE UPDATE OF client_feedback, last_nudged_at, nudge_count ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_feedback_nudge_authority();

CREATE OR REPLACE FUNCTION public.nudge_proposal(p_proposal_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stamp timestamptz := clock_timestamp();
  v_proposal public.proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nudge_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION
      'nudge_proposal: proposal % is "%" — only sent/viewed proposals can be nudged',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.last_nudged_at IS NOT NULL
     AND v_proposal.last_nudged_at > v_stamp - interval '3 days'
  THEN
    RAISE EXCEPTION
      'nudge_proposal: proposal % was nudged on % — wait before nudging again',
      p_proposal_id, v_proposal.last_nudged_at
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_nudge_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET last_nudged_at = v_stamp,
      nudge_count = nudge_count + 1,
      updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_nudge_id', '', true);

  RETURN v_stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.nudge_proposal(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.nudge_proposal(uuid) TO authenticated;

COMMENT ON FUNCTION public.nudge_proposal(uuid) IS
  'Row-locked proposal reminder. Exact designer or active non-guest '
  'design_studio peer only; stamps nudge state under app.proposal_nudge_id.';

CREATE OR REPLACE FUNCTION public.request_proposal_change(
  p_proposal_id uuid,
  p_feedback text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_feedback text := btrim(COALESCE(p_feedback, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_proposal_change requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_feedback = '' THEN
    RAISE EXCEPTION 'change-request feedback is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_proposal.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the proposal''s client may request changes'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not open for change requests (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_feedback_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET client_feedback = v_feedback,
      updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_feedback_id', '', true);

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    p_proposal_id, auth.uid(), 'change_requested',
    jsonb_build_object('via', 'request_proposal_change')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_proposal_change(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_proposal_change(uuid, text)
  TO authenticated;

-- ── Decision + option table authority ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_client_decision_reference_integrity(
  p_decision_id uuid,
  p_designer_client_id uuid,
  p_designer_id uuid,
  p_project_id uuid,
  p_status text,
  p_phase_id uuid,
  p_room_id uuid,
  p_blocks_milestone_id uuid,
  p_court_party_id uuid,
  p_linked_proposal_id uuid,
  p_recommended_option_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_relationship_client_id uuid;
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT client_id INTO v_relationship_client_id
  FROM public.designer_clients
  WHERE id = p_designer_client_id
    AND designer_id IS NOT DISTINCT FROM p_designer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'client decision designer identity does not match its relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_project_id IS NULL THEN
    IF p_phase_id IS NOT NULL
       OR p_room_id IS NOT NULL
       OR p_blocks_milestone_id IS NOT NULL
       OR p_court_party_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'project-scoped decision references require a project'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_project
    FROM public.projects
    WHERE id = p_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'decision project does not exist'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_project.client_id IS DISTINCT FROM v_relationship_client_id THEN
      RAISE EXCEPTION 'decision project must match its relationship client'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_linked_proposal_id IS NULL
       AND v_project.designer_id IS DISTINCT FROM p_designer_id
    THEN
      RAISE EXCEPTION 'decision project must match its relationship designer'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_status IN ('draft', 'pending')
       AND v_project.status IN ('completed', 'archived')
    THEN
      RAISE EXCEPTION 'terminal projects cannot carry open decisions'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_phase_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.project_phases
       WHERE id = p_phase_id AND project_id = p_project_id
     )
  THEN
    RAISE EXCEPTION 'decision phase must belong to its project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_room_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.project_rooms
       WHERE id = p_room_id AND project_id = p_project_id
     )
  THEN
    RAISE EXCEPTION 'decision room must belong to its project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_blocks_milestone_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.schedule_milestones AS milestone
       JOIN public.project_phases AS phase ON phase.id = milestone.phase_id
       WHERE milestone.id = p_blocks_milestone_id
         AND phase.project_id = p_project_id
     )
  THEN
    RAISE EXCEPTION 'blocked milestone must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_court_party_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.project_parties
       WHERE id = p_court_party_id AND project_id = p_project_id
     )
  THEN
    RAISE EXCEPTION 'court party must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_linked_proposal_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.proposals AS proposal
       JOIN public.designer_clients AS relationship
         ON relationship.id = proposal.designer_client_id
       WHERE proposal.id = p_linked_proposal_id
         AND proposal.designer_client_id = p_designer_client_id
         AND proposal.designer_id IS NOT DISTINCT FROM p_designer_id
         AND proposal.client_id IS NOT DISTINCT FROM v_relationship_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM proposal.client_id
         AND (
           p_project_id IS NULL
           OR proposal.project_id IS NOT DISTINCT FROM p_project_id
         )
     )
  THEN
    RAISE EXCEPTION 'linked proposal must match the decision relationship and project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_recommended_option_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.client_decision_options
       WHERE id = p_recommended_option_id AND decision_id = p_decision_id
     )
  THEN
    RAISE EXCEPTION 'recommended option must belong to its decision'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_decision_reference_integrity(
  uuid, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_client_decision_reference_integrity(
  uuid, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_client_decision_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_maintenance boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND auth.uid() IS NULL
    AND COALESCE(auth.role(), '') NOT IN ('authenticated', 'service_role');
  v_protected_change boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT v_maintenance
       AND (
         current_user IS DISTINCT FROM 'postgres'
         OR current_setting('app.client_decision_write_id', true)
            IS DISTINCT FROM OLD.id::text
       )
    THEN
      RAISE EXCEPTION
        'client decisions may only be deleted through delete_client_decision_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  PERFORM public.assert_client_decision_reference_integrity(
    NEW.id,
    NEW.designer_client_id,
    NEW.designer_id,
    NEW.project_id,
    NEW.status,
    NEW.phase_id,
    NEW.room_id,
    NEW.blocks_milestone_id,
    NEW.court_party_id,
    NEW.linked_proposal_id,
    NEW.recommended_option_id
  );

  IF TG_OP = 'INSERT' THEN
    -- Every row, including a trusted workflow insert, must bind to the exact
    -- designer↔client relationship named by its denormalized designer_id.
    IF NOT EXISTS (
      SELECT 1
      FROM public.designer_clients AS relationship
      WHERE relationship.id = NEW.designer_client_id
        AND relationship.designer_id IS NOT DISTINCT FROM NEW.designer_id
    ) THEN
      RAISE EXCEPTION
        'client decision designer identity does not match its relationship'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_maintenance THEN
      RETURN NEW;
    END IF;

    IF NEW.status IN ('responded', 'expired')
       OR NEW.responded_at IS NOT NULL
       OR NEW.selected_by IS NOT NULL
       OR NEW.answer IS NOT NULL
       OR NEW.answered_at IS NOT NULL
       OR NEW.answered_by IS NOT NULL
       OR NEW.client_consent_method IS NOT NULL
       OR NEW.client_consented_at IS NOT NULL
       OR NEW.client_signature IS NOT NULL
    THEN
      IF current_user IS DISTINCT FROM 'postgres'
         OR current_setting('app.client_decision_insert_id', true)
            IS DISTINCT FROM NEW.id::text
      THEN
        RAISE EXCEPTION
          'resolved decision truth may only be inserted by a canonical workflow'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF current_user IS DISTINCT FROM 'postgres' THEN
      IF NOT (
        NEW.designer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.organization_members AS actor_membership
          JOIN public.organization_members AS owner_membership
            ON owner_membership.organization_id = actor_membership.organization_id
          JOIN public.organizations AS organization
            ON organization.id = actor_membership.organization_id
          WHERE actor_membership.user_id = auth.uid()
            AND actor_membership.status = 'active'
            AND actor_membership.role <> 'guest'
            AND owner_membership.user_id = NEW.designer_id
            AND owner_membership.status = 'active'
            AND owner_membership.role <> 'guest'
            AND organization.type = 'design_studio'
            AND organization.status = 'active'
        )
      ) THEN
        RAISE EXCEPTION 'not authorized to create a client decision'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.status NOT IN ('draft', 'pending') THEN
        RAISE EXCEPTION 'client decision inserts must start draft or pending'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'draft' AND NEW.sent_at IS NOT NULL THEN
        RAISE EXCEPTION 'draft client decisions cannot be pre-published'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.decision_type = 'approval' AND NEW.linked_proposal_id IS NOT NULL THEN
        RAISE EXCEPTION
          'proposal approval decisions may only be inserted by signature authority'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  v_protected_change :=
       NEW.id IS DISTINCT FROM OLD.id
    OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
    OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.linked_proposal_id IS DISTINCT FROM OLD.linked_proposal_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.context IS DISTINCT FROM OLD.context
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.linked_phase IS DISTINCT FROM OLD.linked_phase
    OR NEW.phase_id IS DISTINCT FROM OLD.phase_id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.section_key IS DISTINCT FROM OLD.section_key
    OR NEW.decision_type IS DISTINCT FROM OLD.decision_type
    OR NEW.decision_kind IS DISTINCT FROM OLD.decision_kind
    OR NEW.coordination_kind IS DISTINCT FROM OLD.coordination_kind
    OR NEW.blocking_status IS DISTINCT FROM OLD.blocking_status
    OR NEW.blocks_kind IS DISTINCT FROM OLD.blocks_kind
    OR NEW.blocks_milestone_id IS DISTINCT FROM OLD.blocks_milestone_id
    OR NEW.court IS DISTINCT FROM OLD.court
    OR NEW.court_party_id IS DISTINCT FROM OLD.court_party_id
    OR NEW.recommended_option_id IS DISTINCT FROM OLD.recommended_option_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
    OR NEW.selected_by IS DISTINCT FROM OLD.selected_by
    OR NEW.answer IS DISTINCT FROM OLD.answer
    OR NEW.answered_at IS DISTINCT FROM OLD.answered_at
    OR NEW.answered_by IS DISTINCT FROM OLD.answered_by
    OR NEW.client_consent_method IS DISTINCT FROM OLD.client_consent_method
    OR NEW.client_consented_at IS DISTINCT FROM OLD.client_consented_at
    OR NEW.client_signature IS DISTINCT FROM OLD.client_signature;

  IF v_protected_change
     AND NOT v_maintenance
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.client_decision_write_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    -- Temporary installed-iOS bridge. The authenticated role has UPDATE only
    -- on viewed_at and these consent columns, and RLS restricts the row to the
    -- addressed client. Consent may be filled exactly once after the canonical
    -- apply_decision transition; lifecycle/selection truth remains protected.
    IF current_user IS NOT DISTINCT FROM 'authenticated'
       AND OLD.status = 'responded'
       AND NEW.status = 'responded'
       AND OLD.client_consent_method IS NULL
       AND OLD.client_consented_at IS NULL
       AND OLD.client_signature IS NULL
       AND NEW.client_consent_method IS NOT NULL
       AND NEW.client_consented_at IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.designer_clients AS relationship
         WHERE relationship.id = OLD.designer_client_id
           AND relationship.client_id = auth.uid()
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'client decision business truth may only change through a canonical workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_client_decision_authority_trg
  ON public.client_decisions;
-- Expand phase: leave this guard unattached until the extension and rollback
-- web bundles have adopted the canonical decision RPCs.

CREATE OR REPLACE FUNCTION public.guard_client_decision_option_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.decision_id
                             ELSE NEW.decision_id END;
  v_decision public.client_decisions%ROWTYPE;
  v_maintenance boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND auth.uid() IS NULL
    AND COALESCE(auth.role(), '') NOT IN ('authenticated', 'service_role');
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = v_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found for option write', v_decision_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_maintenance THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER workflows and direct database maintenance execute as
  -- postgres even when a JWT claim remains set on the transaction. Their
  -- function bodies own option creation; end-user table inserts execute as
  -- authenticated and still take the exact-author branch below.
  IF TG_OP = 'INSERT' AND current_user IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND current_user IS DISTINCT FROM 'postgres' THEN
    IF NOT (
      v_decision.designer_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        JOIN public.organization_members AS owner_membership
          ON owner_membership.organization_id = actor_membership.organization_id
        JOIN public.organizations AS organization
          ON organization.id = actor_membership.organization_id
        WHERE actor_membership.user_id = auth.uid()
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND owner_membership.user_id = v_decision.designer_id
          AND owner_membership.status = 'active'
          AND owner_membership.role <> 'guest'
          AND organization.type = 'design_studio'
          AND organization.status = 'active'
      )
    ) OR v_decision.status NOT IN ('draft', 'pending')
    THEN
      RAISE EXCEPTION 'not authorized to add an option to decision %', v_decision_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(NEW.selected, false) OR NEW.client_note IS NOT NULL THEN
      RAISE EXCEPTION 'new decision options cannot preload client selection truth'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM 'postgres'
     OR current_setting('app.client_decision_write_id', true)
        IS DISTINCT FROM v_decision_id::text
  THEN
    RAISE EXCEPTION
      'decision options may only change through a canonical decision workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.decision_id IS DISTINCT FROM OLD.decision_id THEN
    RAISE EXCEPTION 'decision option ownership is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_option_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_client_decision_option_authority_trg
  ON public.client_decision_options;
-- Expand phase: leave this guard unattached until the extension and rollback
-- web bundles have adopted the canonical decision RPCs.

-- The recommendation mirror is itself a canonical parent/option workflow.
-- Make both directions DEFINER-owned and set the exact parent capability.
CREATE OR REPLACE FUNCTION public.sync_decision_recommended_option()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_capability text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  PERFORM set_config('app.client_decision_write_id', NEW.decision_id::text, true);

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_recommended = true THEN
    UPDATE public.client_decision_options
    SET is_recommended = false
    WHERE decision_id = NEW.decision_id
      AND id <> NEW.id
      AND is_recommended = true;

    UPDATE public.client_decisions
    SET recommended_option_id = NEW.id
    WHERE id = NEW.decision_id
      AND recommended_option_id IS DISTINCT FROM NEW.id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.is_recommended = true
     AND NEW.is_recommended = false
     AND NOT EXISTS (
       SELECT 1 FROM public.client_decision_options
       WHERE decision_id = NEW.decision_id
         AND is_recommended = true
         AND id <> NEW.id
     )
  THEN
    UPDATE public.client_decisions
    SET recommended_option_id = NULL
    WHERE id = NEW.decision_id;
  END IF;

  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_capability, ''), true
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_decision_recommended_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_capability text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF NEW.recommended_option_id IS DISTINCT FROM OLD.recommended_option_id THEN
    PERFORM set_config('app.client_decision_write_id', NEW.id::text, true);
    IF NEW.recommended_option_id IS NOT NULL THEN
      UPDATE public.client_decision_options
      SET is_recommended = (id = NEW.recommended_option_id)
      WHERE decision_id = NEW.id;
    ELSE
      UPDATE public.client_decision_options
      SET is_recommended = false
      WHERE decision_id = NEW.id
        AND is_recommended = true;
    END IF;
    PERFORM set_config(
      'app.client_decision_write_id', COALESCE(v_previous_capability, ''), true
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_decision_recommended_option()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_decision_recommended_from_parent()
  FROM PUBLIC, anon, authenticated, service_role;

-- RLS remains the read/insert visibility layer. UPDATE/DELETE authority is
-- removed at the ACL and policy layers, then reintroduced only through the
-- checked SECURITY DEFINER functions below.
DROP POLICY IF EXISTS "Designers can manage their decisions"
  ON public.client_decisions;
DROP POLICY IF EXISTS "Clients can respond to their decisions"
  ON public.client_decisions;
DROP POLICY IF EXISTS "client_decisions_studio_rw"
  ON public.client_decisions;

DROP POLICY IF EXISTS client_decisions_studio_select
  ON public.client_decisions;
CREATE POLICY client_decisions_studio_select
ON public.client_decisions FOR SELECT TO authenticated
USING (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS client_decisions_studio_insert
  ON public.client_decisions;
CREATE POLICY client_decisions_studio_insert
ON public.client_decisions FOR INSERT TO authenticated
WITH CHECK (public.is_studio_comember(designer_id));

-- Installed Patina iOS builds still PATCH viewed_at and then the three consent
-- columns after apply_decision. RLS scopes this temporary compatibility path
-- to the addressed client; column grants below prevent any lifecycle write.
DROP POLICY IF EXISTS client_decisions_client_compat_update
  ON public.client_decisions;
CREATE POLICY client_decisions_client_compat_update
ON public.client_decisions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.designer_clients AS relationship
    WHERE relationship.id = client_decisions.designer_client_id
      AND relationship.client_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.designer_clients AS relationship
    WHERE relationship.id = client_decisions.designer_client_id
      AND relationship.client_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.client_decisions FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.client_decisions FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.client_decisions TO authenticated;
GRANT UPDATE (
  viewed_at, client_consent_method, client_consented_at, client_signature
) ON TABLE public.client_decisions TO authenticated;
GRANT ALL ON TABLE public.client_decisions TO service_role;

DROP POLICY IF EXISTS "Designers can manage decision options"
  ON public.client_decision_options;
DROP POLICY IF EXISTS "Clients can select decision options"
  ON public.client_decision_options;
DROP POLICY IF EXISTS "client_decision_options_studio_rw"
  ON public.client_decision_options;

DROP POLICY IF EXISTS client_decision_options_studio_select
  ON public.client_decision_options;
CREATE POLICY client_decision_options_studio_select
ON public.client_decision_options FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
);

DROP POLICY IF EXISTS client_decision_options_studio_insert
  ON public.client_decision_options;
CREATE POLICY client_decision_options_studio_insert
ON public.client_decision_options FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.client_decision_options FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.client_decision_options FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.client_decision_options TO authenticated;
GRANT ALL ON TABLE public.client_decision_options TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.decision_overrides
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.decision_overrides TO authenticated;
GRANT ALL ON TABLE public.decision_overrides TO service_role;

-- Expand phase: restore the authenticated legacy surfaces after installing the
-- canonical RPCs. Old portal/extension builds are distributed independently,
-- so enforcement moves to a later adoption-gated migration. Anonymous writes
-- remain revoked and the existing RLS ownership boundaries remain in force.
DROP POLICY IF EXISTS "Designers can manage their decisions"
  ON public.client_decisions;
CREATE POLICY "Designers can manage their decisions"
ON public.client_decisions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.designer_clients AS relationship
    WHERE relationship.id = client_decisions.designer_client_id
      AND relationship.designer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients can respond to their decisions"
  ON public.client_decisions;
CREATE POLICY "Clients can respond to their decisions"
ON public.client_decisions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.designer_clients AS relationship
    WHERE relationship.id = client_decisions.designer_client_id
      AND relationship.client_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.designer_clients AS relationship
    WHERE relationship.id = client_decisions.designer_client_id
      AND relationship.client_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_decisions_studio_rw"
  ON public.client_decisions;
CREATE POLICY "client_decisions_studio_rw"
ON public.client_decisions FOR ALL TO authenticated
USING (public.is_studio_comember(designer_id))
WITH CHECK (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS "Designers can manage decision options"
  ON public.client_decision_options;
CREATE POLICY "Designers can manage decision options"
ON public.client_decision_options FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
    WHERE decision.id = client_decision_options.decision_id
      AND relationship.designer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients can select decision options"
  ON public.client_decision_options;
CREATE POLICY "Clients can select decision options"
ON public.client_decision_options FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
    WHERE decision.id = client_decision_options.decision_id
      AND relationship.client_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
    WHERE decision.id = client_decision_options.decision_id
      AND relationship.client_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_decision_options_studio_rw"
  ON public.client_decision_options;
CREATE POLICY "client_decision_options_studio_rw"
ON public.client_decision_options FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_decisions
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_decision_options
  TO authenticated;
GRANT SELECT, INSERT ON TABLE public.decision_overrides TO authenticated;

-- Decision lifecycle notices are durable effects of the same transaction as
-- the state change.  Keep the primitive private so a caller cannot forge a
-- notice for a row they cannot transition.
CREATE OR REPLACE FUNCTION public._enqueue_decision_notification(
  p_decision_id uuid,
  p_kind public.decision_notification_kind
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_client_id uuid;
  v_recipient_id uuid;
  v_notification_id uuid;
BEGIN
  SELECT decision.*
  INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_decision.designer_client_id;

  IF p_kind IN ('decision_required', 'decision_updated') THEN
    IF v_decision.status <> 'pending' THEN
      RAISE EXCEPTION '% requires a pending decision', p_kind
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_client_id;
  ELSIF p_kind = 'decision_overdue' THEN
    IF v_decision.status <> 'pending'
       OR v_decision.due_date IS NULL
       OR v_decision.due_date >= now()
    THEN
      RAISE EXCEPTION 'decision_overdue requires an overdue pending decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_client_id;
  ELSIF p_kind = 'decision_resolved' THEN
    IF v_decision.status <> 'responded' THEN
      RAISE EXCEPTION 'decision_resolved requires a responded decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_decision.designer_id;
  ELSE
    RAISE EXCEPTION 'unsupported decision notification kind %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'decision % has no notification recipient', p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_kind = 'decision_updated' THEN
    INSERT INTO public.decision_notifications (user_id, decision_id, kind)
    VALUES (v_recipient_id, p_decision_id, p_kind)
    RETURNING id INTO v_notification_id;
  ELSE
    INSERT INTO public.decision_notifications (user_id, decision_id, kind)
    VALUES (v_recipient_id, p_decision_id, p_kind)
    ON CONFLICT (decision_id, kind)
      WHERE kind <> 'decision_updated'
    DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_decision_notification(
  uuid, public.decision_notification_kind
) FROM PUBLIC, anon, authenticated, service_role;

-- Edge workers retain narrow, status-checked compatibility entry points. The
-- previously shipped Chrome extension also calls decision_required after its
-- two guarded INSERTs, so that one notification permits the exact studio
-- author during the compatibility window.
CREATE OR REPLACE FUNCTION public.notify_decision_required(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.client_decisions AS decision
         WHERE decision.id = p_decision_id
           AND public.is_studio_comember(decision.designer_id)
       )
     )
  THEN
    RAISE EXCEPTION
      'notify_decision_required requires service_role or the decision studio'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_overdue(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'notify_decision_overdue is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_overdue'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_resolved(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.client_decisions AS decision
         JOIN public.designer_clients AS relationship
           ON relationship.id = decision.designer_client_id
         WHERE decision.id = p_decision_id
           AND (
             relationship.client_id = auth.uid()
             OR public.is_studio_comember(decision.designer_id)
           )
       )
     )
  THEN
    RAISE EXCEPTION
      'notify_decision_resolved requires service_role or a decision party'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_updated(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.client_decisions AS decision
         WHERE decision.id = p_decision_id
           AND public.is_studio_comember(decision.designer_id)
       )
     )
  THEN
    RAISE EXCEPTION
      'notify_decision_updated requires service_role or the decision studio'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_updated'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_decision_required(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_decision_overdue(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_decision_resolved(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_decision_updated(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_decision_required(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_decision_overdue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_decision_resolved(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_decision_updated(uuid)
  TO authenticated, service_role;

-- One checked create owns the parent row, option children, dependency web and
-- first notification.  The caller supplies the UUID as an idempotency token.
CREATE OR REPLACE FUNCTION public.create_client_decision(
  p_decision_id uuid,
  p_payload jsonb,
  p_options jsonb DEFAULT '[]'::jsonb,
  p_blocked_ffe_item_ids uuid[] DEFAULT '{}'::uuid[],
  p_blocked_task_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_relationship public.designer_clients%ROWTYPE;
  v_decision public.client_decisions%ROWTYPE;
  v_project_id uuid;
  v_status text;
  v_unknown jsonb;
  v_expected_count integer;
  v_matched_count integer;
  v_existing_payload jsonb;
  v_requested_payload jsonb;
  v_existing_options jsonb;
  v_requested_options jsonb;
  v_existing_ffe_ids uuid[];
  v_requested_ffe_ids uuid[];
  v_existing_task_ids uuid[];
  v_requested_task_ids uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL THEN
    RAISE EXCEPTION 'p_decision_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(COALESCE(p_options, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_options must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'designer_client_id', 'project_id', 'title', 'context', 'due_date',
    'linked_phase', 'phase_id', 'room_id', 'section_key', 'decision_type',
    'decision_kind', 'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id', 'status'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF btrim(COALESCE(p_payload->>'title', '')) = '' THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_status := COALESCE(NULLIF(p_payload->>'status', ''), 'pending');
  IF v_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'new decisions must start draft or pending'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE id = NULLIF(p_payload->>'designer_client_id', '')::uuid
  FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'relationship not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status = 'pending' AND v_relationship.client_id IS NULL THEN
    RAISE EXCEPTION 'pending decisions require a registered client recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  v_project_id := NULLIF(p_payload->>'project_id', '')::uuid;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb)) AS option(value)
    WHERE jsonb_typeof(option.value) <> 'object'
       OR btrim(COALESCE(option.value->>'name', '')) = ''
       OR COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1) < 1
       OR COALESCE(NULLIF(option.value->>'sort_order', '')::integer, 0) < 0
       OR COALESCE((option.value->>'selected')::boolean, false)
       OR option.value ? 'client_note'
  ) THEN
    RAISE EXCEPTION 'invalid decision option payload'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A reused key is an exact receipt, never permission to overwrite a row.
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF FOUND THEN
    v_existing_payload := jsonb_build_object(
      'designer_client_id', v_decision.designer_client_id,
      'project_id', v_decision.project_id,
      'title', v_decision.title,
      'context', v_decision.context,
      'due_date', v_decision.due_date,
      'linked_phase', v_decision.linked_phase,
      'phase_id', v_decision.phase_id,
      'room_id', v_decision.room_id,
      'section_key', v_decision.section_key,
      'decision_type', v_decision.decision_type,
      'decision_kind', v_decision.decision_kind,
      'coordination_kind', v_decision.coordination_kind,
      'blocking_status', v_decision.blocking_status,
      'blocks_kind', v_decision.blocks_kind,
      'blocks_milestone_id', v_decision.blocks_milestone_id,
      'court', v_decision.court,
      'court_party_id', v_decision.court_party_id,
      'status', v_decision.status
    );
    v_requested_payload := jsonb_build_object(
      'designer_client_id', v_relationship.id,
      'project_id', v_project_id,
      'title', btrim(p_payload->>'title'),
      'context', p_payload->>'context',
      'due_date', NULLIF(p_payload->>'due_date', '')::timestamptz,
      'linked_phase', p_payload->>'linked_phase',
      'phase_id', NULLIF(p_payload->>'phase_id', '')::uuid,
      'room_id', NULLIF(p_payload->>'room_id', '')::uuid,
      'section_key', p_payload->>'section_key',
      'decision_type', COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
      'decision_kind', COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
      'coordination_kind', COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
      'blocking_status', COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
      'blocks_kind', COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
      'blocks_milestone_id', NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
      'court', COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
      'court_party_id', NULLIF(p_payload->>'court_party_id', '')::uuid,
      'status', v_status
    );

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', option.name,
      'image_url', option.image_url,
      'designer_note', option.designer_note,
      'is_recommended', COALESCE(option.is_recommended, false),
      'price', option.price,
      'quantity', COALESCE(option.quantity, 1),
      'cost_delta_cents', option.cost_delta_cents,
      'lead_time_days_delta', option.lead_time_days_delta,
      'product_id', option.product_id,
      'approves', COALESCE(option.approves, false),
      'sort_order', COALESCE(option.sort_order, 0)
    ) ORDER BY option.sort_order, option.id), '[]'::jsonb)
    INTO v_existing_options
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', btrim(option.value->>'name'),
      'image_url', option.value->>'image_url',
      'designer_note', option.value->>'designer_note',
      'is_recommended', COALESCE((option.value->>'is_recommended')::boolean, false),
      'price', NULLIF(option.value->>'price', '')::integer,
      'quantity', COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      'cost_delta_cents', NULLIF(option.value->>'cost_delta_cents', '')::integer,
      'lead_time_days_delta', NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      'product_id', NULLIF(option.value->>'product_id', '')::uuid,
      'approves', COALESCE((option.value->>'approves')::boolean, false),
      'sort_order', COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                             option.ordinality::integer - 1)
    ) ORDER BY COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                        option.ordinality::integer - 1)), '[]'::jsonb)
    INTO v_requested_options
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
         WITH ORDINALITY AS option(value, ordinality);

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_existing_ffe_ids
    FROM public.project_ffe_items AS item
    WHERE item.blocked_by_decision_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_ffe_ids
    FROM unnest(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) AS id;
    SELECT COALESCE(array_agg(task.id ORDER BY task.id), '{}'::uuid[])
    INTO v_existing_task_ids
    FROM public.project_tasks AS task
    WHERE task.blocked_by_item_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_task_ids
    FROM unnest(COALESCE(p_blocked_task_ids, '{}'::uuid[])) AS id;

    IF NOT public._can_author_proposal(v_decision.designer_id)
       OR v_existing_payload IS DISTINCT FROM v_requested_payload
       OR v_existing_options IS DISTINCT FROM v_requested_options
       OR v_existing_ffe_ids IS DISTINCT FROM v_requested_ffe_ids
       OR v_existing_task_ids IS DISTINCT FROM v_requested_task_ids
    THEN
      RAISE EXCEPTION 'p_decision_id was already used for another decision'
        USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_decision.status = 'pending' THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_required'
      );
    END IF;
    RETURN v_decision;
  END IF;

  PERFORM public.assert_client_decision_reference_integrity(
    p_decision_id,
    v_relationship.id,
    v_relationship.designer_id,
    v_project_id,
    v_status,
    NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid,
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    NULL,
    NULL
  );

  IF cardinality(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
    ORDER BY item.id
    FOR UPDATE;
    SELECT count(DISTINCT item.id) INTO v_matched_count
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
      AND item.project_id IS NOT DISTINCT FROM v_project_id
      AND (item.blocked_by_decision_id IS NULL
           OR item.blocked_by_decision_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_ffe_item_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked FF&E items must be available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF cardinality(COALESCE(p_blocked_task_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
    ORDER BY task.id
    FOR UPDATE;
    SELECT count(DISTINCT task.id) INTO v_matched_count
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
      AND task.project_id IS NOT DISTINCT FROM v_project_id
      AND task.status <> 'done'
      AND (task.blocked_by_item_id IS NULL
           OR task.blocked_by_item_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_task_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked tasks must be open and available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title, context,
    due_date, linked_phase, phase_id, room_id, section_key, decision_type,
    decision_kind, coordination_kind, blocking_status, blocks_kind,
    blocks_milestone_id, court, court_party_id, status, sent_at
  ) VALUES (
    p_decision_id, v_relationship.id, v_relationship.designer_id, v_project_id,
    btrim(p_payload->>'title'), p_payload->>'context',
    NULLIF(p_payload->>'due_date', '')::timestamptz,
    p_payload->>'linked_phase', NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid, p_payload->>'section_key',
    COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
    COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
    COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
    COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
    COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    v_status, CASE WHEN v_status = 'pending' THEN now() ELSE NULL END
  ) RETURNING * INTO v_decision;

  INSERT INTO public.client_decision_options (
    decision_id, name, image_url, designer_note, is_recommended,
    price, quantity, cost_delta_cents, lead_time_days_delta,
    product_id, approves, selected, client_note, sort_order
  )
  SELECT
    p_decision_id, btrim(option.value->>'name'), option.value->>'image_url',
    option.value->>'designer_note',
    COALESCE((option.value->>'is_recommended')::boolean, false),
    NULLIF(option.value->>'price', '')::integer,
    COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
    NULLIF(option.value->>'cost_delta_cents', '')::integer,
    NULLIF(option.value->>'lead_time_days_delta', '')::integer,
    NULLIF(option.value->>'product_id', '')::uuid,
    COALESCE((option.value->>'approves')::boolean, false),
    false, NULL,
    COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
             option.ordinality::integer - 1)
  FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
       WITH ORDINALITY AS option(value, ordinality);

  UPDATE public.project_ffe_items
  SET blocked = true, blocked_by_decision_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[]));

  UPDATE public.project_tasks
  SET status = 'blocked', blocked_by_item_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_task_ids, '{}'::uuid[]));

  IF v_status = 'pending' THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
  END IF;

  SELECT * INTO v_decision FROM public.client_decisions
  WHERE id = p_decision_id;
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_decision(
  uuid, jsonb, jsonb, uuid[], uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_client_decision(
  uuid, jsonb, jsonb, uuid[], uuid[]
) TO authenticated;

-- Expand phase: installed Chrome extensions and rollback web bundles still use
-- direct decision/option mutations. The legacy authenticated RLS/ACL surfaces
-- restored above remain until version telemetry proves adoption; canonical
-- clients should use this RPC and the checked workflows below.

-- ── Checked decision edit / publish / reopen / expire / delete paths ────────

CREATE OR REPLACE FUNCTION public.update_client_decision(
  p_decision_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_result public.client_decisions%ROWTYPE;
  v_target_project_id uuid;
  v_target_party_id uuid;
  v_relationship_client_id uuid;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_patch - ARRAY[
    'title', 'context', 'due_date', 'linked_phase', 'phase_id', 'room_id',
    'section_key', 'project_id', 'decision_type', 'decision_kind',
    'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision patch keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'decision % cannot be edited from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are signature-workflow only'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_patch ? 'title'
     AND btrim(COALESCE(p_patch->>'title', '')) = ''
  THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT client_id INTO v_relationship_client_id
  FROM public.designer_clients
  WHERE id = v_decision.designer_client_id;

  v_target_project_id := CASE
    WHEN p_patch ? 'project_id' THEN NULLIF(p_patch->>'project_id', '')::uuid
    ELSE v_decision.project_id
  END;

  -- A decision's dependency web, room/phase references, and notification
  -- history are project-scoped. Moving the parent without atomically moving
  -- every one of those children creates cross-project blockers. Accept an
  -- echoed project_id from edit forms, but make actual project identity
  -- immutable after creation.
  IF v_target_project_id IS DISTINCT FROM v_decision.project_id THEN
    RAISE EXCEPTION 'decision project is immutable after creation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_patch ? 'project_id'
     AND v_target_project_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.projects AS project
       WHERE project.id = v_target_project_id
         AND project.designer_id IS NOT DISTINCT FROM v_decision.designer_id
         AND project.client_id IS NOT DISTINCT FROM v_relationship_client_id
     )
  THEN
    RAISE EXCEPTION
      'decision project must match its exact designer/client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  v_target_party_id := CASE
    WHEN p_patch ? 'court_party_id'
      THEN NULLIF(p_patch->>'court_party_id', '')::uuid
    ELSE v_decision.court_party_id
  END;
  IF v_target_party_id IS NOT NULL
     AND (
       v_target_project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_parties AS party
         WHERE party.id = v_target_party_id
           AND party.project_id = v_target_project_id
       )
     )
  THEN
    RAISE EXCEPTION 'court party must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_options IS NOT NULL THEN
    IF jsonb_typeof(p_options) <> 'array' THEN
      RAISE EXCEPTION 'p_options must be a JSON array'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_options) AS option(value)
      WHERE jsonb_typeof(option.value) <> 'object'
         OR btrim(COALESCE(option.value->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'every decision option requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decisions
  SET title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE title END,
      context = CASE WHEN p_patch ? 'context' THEN p_patch->>'context' ELSE context END,
      due_date = CASE WHEN p_patch ? 'due_date'
        THEN NULLIF(p_patch->>'due_date', '')::timestamptz ELSE due_date END,
      linked_phase = CASE WHEN p_patch ? 'linked_phase'
        THEN p_patch->>'linked_phase' ELSE linked_phase END,
      phase_id = CASE WHEN p_patch ? 'phase_id'
        THEN NULLIF(p_patch->>'phase_id', '')::uuid ELSE phase_id END,
      room_id = CASE WHEN p_patch ? 'room_id'
        THEN NULLIF(p_patch->>'room_id', '')::uuid ELSE room_id END,
      section_key = CASE WHEN p_patch ? 'section_key'
        THEN p_patch->>'section_key' ELSE section_key END,
      project_id = v_target_project_id,
      decision_type = CASE WHEN p_patch ? 'decision_type'
        THEN p_patch->>'decision_type' ELSE decision_type END,
      decision_kind = CASE WHEN p_patch ? 'decision_kind'
        THEN p_patch->>'decision_kind' ELSE decision_kind END,
      coordination_kind = CASE WHEN p_patch ? 'coordination_kind'
        THEN p_patch->>'coordination_kind' ELSE coordination_kind END,
      blocking_status = CASE WHEN p_patch ? 'blocking_status'
        THEN p_patch->>'blocking_status' ELSE blocking_status END,
      blocks_kind = CASE WHEN p_patch ? 'blocks_kind'
        THEN p_patch->>'blocks_kind' ELSE blocks_kind END,
      blocks_milestone_id = CASE WHEN p_patch ? 'blocks_milestone_id'
        THEN NULLIF(p_patch->>'blocks_milestone_id', '')::uuid
        ELSE blocks_milestone_id END,
      court = CASE WHEN p_patch ? 'court' THEN p_patch->>'court' ELSE court END,
      court_party_id = v_target_party_id,
      updated_at = now()
  WHERE id = p_decision_id;

  IF p_options IS NOT NULL THEN
    DELETE FROM public.client_decision_options
    WHERE decision_id = p_decision_id;

    INSERT INTO public.client_decision_options (
      decision_id, name, image_url, designer_note, is_recommended,
      price, quantity, cost_delta_cents, lead_time_days_delta,
      product_id, approves, selected, client_note, sort_order
    )
    SELECT
      p_decision_id,
      btrim(option.value->>'name'),
      option.value->>'image_url',
      option.value->>'designer_note',
      COALESCE((option.value->>'is_recommended')::boolean, false),
      NULLIF(option.value->>'price', '')::integer,
      COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      NULLIF(option.value->>'cost_delta_cents', '')::integer,
      NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      NULLIF(option.value->>'product_id', '')::uuid,
      COALESCE((option.value->>'approves')::boolean, false),
      false,
      NULL,
      COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
               option.ordinality::integer - 1)
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS option(value, ordinality);
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  SELECT * INTO v_result FROM public.client_decisions WHERE id = p_decision_id;

  PERFORM public.assert_client_decision_reference_integrity(
    v_result.id,
    v_result.designer_client_id,
    v_result.designer_id,
    v_result.project_id,
    v_result.status,
    v_result.phase_id,
    v_result.room_id,
    v_result.blocks_milestone_id,
    v_result.court_party_id,
    v_result.linked_proposal_id,
    v_result.recommended_option_id
  );

  IF v_result.status = 'pending'
     AND (p_patch <> '{}'::jsonb OR p_options IS NOT NULL)
  THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_updated'
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_coordination_item(
  p_item_id uuid,
  p_patch jsonb,
  p_options jsonb,
  p_blocked_ffe_item_ids uuid[],
  p_blocked_task_ids uuid[],
  p_expected_updated_at timestamptz
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_expected_count integer;
  v_matched_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_coordination_item requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_item.designer_id) THEN
    RAISE EXCEPTION 'coordination item % not found or access denied', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'coordination item % is immutable from status %',
      p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_blocked_ffe_item_ids IS NOT NULL
     AND cardinality(p_blocked_ffe_item_ids) > 0
  THEN
    PERFORM 1
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
    ORDER BY item.id
    FOR UPDATE;
    SELECT count(DISTINCT item.id) INTO v_matched_count
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
      AND item.project_id IS NOT DISTINCT FROM v_item.project_id
      AND (item.blocked_by_decision_id IS NULL
           OR item.blocked_by_decision_id = p_item_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_ffe_item_ids) AS id;
    IF v_item.project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked FF&E items must be available in the item project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_blocked_task_ids IS NOT NULL
     AND cardinality(p_blocked_task_ids) > 0
  THEN
    PERFORM 1
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
    ORDER BY task.id
    FOR UPDATE;
    SELECT count(DISTINCT task.id) INTO v_matched_count
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
      AND task.project_id IS NOT DISTINCT FROM v_item.project_id
      AND task.status <> 'done'
      AND (task.blocked_by_item_id IS NULL
           OR task.blocked_by_item_id = p_item_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_task_ids) AS id;
    IF v_item.project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked tasks must be open and available in the item project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_item := public.update_client_decision(
    p_item_id,
    COALESCE(p_patch, '{}'::jsonb),
    p_options,
    p_expected_updated_at
  );

  IF p_blocked_ffe_item_ids IS NOT NULL THEN
    UPDATE public.project_ffe_items
    SET blocked = false,
        blocked_reason = NULL,
        blocked_by_decision_id = NULL,
        updated_at = now()
    WHERE blocked_by_decision_id = p_item_id
      AND NOT (id = ANY(p_blocked_ffe_item_ids));

    UPDATE public.project_ffe_items
    SET blocked = true,
        blocked_by_decision_id = p_item_id,
        updated_at = now()
    WHERE id = ANY(p_blocked_ffe_item_ids);
  END IF;

  IF p_blocked_task_ids IS NOT NULL THEN
    UPDATE public.project_tasks
    SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
    WHERE blocked_by_item_id = p_item_id
      AND NOT (id = ANY(p_blocked_task_ids));

    UPDATE public.project_tasks
    SET status = 'blocked', blocked_by_item_id = p_item_id, updated_at = now()
    WHERE id = ANY(p_blocked_task_ids);
  END IF;

  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id;
  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.update_coordination_item(
  uuid, jsonb, jsonb, uuid[], uuid[], timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_coordination_item(
  uuid, jsonb, jsonb, uuid[], uuid[], timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'pending' THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'draft' THEN
    RAISE EXCEPTION 'decision % cannot publish from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'pending', sent_at = COALESCE(sent_at, now()), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.publish_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'pending' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status NOT IN ('responded', 'expired') THEN
    RAISE EXCEPTION 'decision % cannot reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are terminal'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decision_options
  SET selected = false, client_note = NULL
  WHERE decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'pending',
      responded_at = NULL,
      selected_by = NULL,
      answer = NULL,
      answered_at = NULL,
      answered_by = NULL,
      client_consent_method = NULL,
      client_consented_at = NULL,
      client_signature = NULL,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_client_decision(uuid) TO authenticated;

-- Extending an expired item is one lifecycle act, not an editable-field write
-- followed by a separate reopen.  The old two-call browser path could commit
-- the new deadline and then fail before restoring pending status (or vice
-- versa).  A required compare-and-swap token linearizes the act; once the
-- exact effect exists, a network retry is a receipt rather than a duplicate
-- lifecycle event/notification.
CREATE OR REPLACE FUNCTION public.extend_and_reopen_client_decision(
  p_decision_id uuid,
  p_due_date timestamptz,
  p_expected_updated_at timestamptz
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'extend_and_reopen_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'p_due_date is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are terminal'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The only pending state accepted by this RPC is the exact receipt of a
  -- prior expired->pending call. Ordinary pending deadline edits continue to
  -- use update_client_decision and its decision_updated notification.
  IF v_decision.status = 'pending' THEN
    IF v_decision.due_date IS NOT DISTINCT FROM p_due_date THEN
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION
      'decision % already reflects a different extend-and-reopen effect',
      p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status <> 'expired' THEN
    RAISE EXCEPTION 'decision % cannot extend-and-reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF p_due_date <= now() THEN
    RAISE EXCEPTION 'an extended due date must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decision_options
  SET selected = false, client_note = NULL
  WHERE decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'pending',
      due_date = p_due_date,
      responded_at = NULL,
      viewed_at = NULL,
      reminder_sent_at = NULL,
      selected_by = NULL,
      answer = NULL,
      answered_at = NULL,
      answered_by = NULL,
      client_consent_method = NULL,
      client_consented_at = NULL,
      client_signature = NULL,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);

  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_and_reopen_client_decision(
  uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.extend_and_reopen_client_decision(
  uuid, timestamptz, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.extend_and_reopen_client_decision(
  uuid, timestamptz, timestamptz
) IS
  'Atomic expired-decision recovery: CAS-locks the row, installs a future '
  'deadline, clears prior response/view/reminder evidence, restores pending, '
  'and owns the single decision_required notice. Exact pending retries return '
  'the existing effect.';

CREATE OR REPLACE FUNCTION public.expire_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'expired' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot expire from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'expired', updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_due_client_decisions(
  p_cutoff timestamptz
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'expire_due_client_decisions is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'p_cutoff is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_id IN
    SELECT decision.id
    FROM public.client_decisions AS decision
    WHERE decision.status = 'pending'
      AND decision.due_date IS NOT NULL
      AND decision.due_date < p_cutoff
    ORDER BY decision.id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_id::text, true);
    UPDATE public.client_decisions AS decision
    SET status = 'expired', updated_at = now()
    WHERE decision.id = v_id
      AND decision.status = 'pending';
    PERFORM set_config('app.client_decision_write_id', '', true);
    id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_client_decisions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_client_decisions(timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_client_decision_viewed(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
    AND relationship.client_id = auth.uid()
  FOR UPDATE OF decision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found or not addressed to you', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending decisions may be marked viewed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_decision.viewed_at IS NULL THEN
    PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
    UPDATE public.client_decisions
    SET viewed_at = now(), updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;
    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_decision_viewed(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_client_decision_viewed(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.stamp_client_decision_reminder(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_client_id uuid;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending decisions may be reminded'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.reminder_sent_at IS NOT NULL
     AND v_decision.reminder_sent_at > now() - interval '1 hour'
  THEN
    RAISE EXCEPTION 'a reminder was sent less than one hour ago'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_decision.designer_client_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'decision has no registered client reminder recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.notification_log (
    user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_client_id,
    'decision_reminder',
    'in_app',
    'delivered',
    'decision_reminder_v1',
    jsonb_build_object(
      'decision_id', p_decision_id,
      'subject', 'Decision reminder',
      'preview', v_decision.title,
      'deep_link', '/decisions/' || p_decision_id::text
    ),
    now()
  );

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET reminder_sent_at = now(), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_client_decision_reminder(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.stamp_client_decision_reminder(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_client_decision_draft(p_decision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_cleared_ffe integer;
  v_cleared_tasks integer;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status <> 'draft' THEN
    RAISE EXCEPTION 'only draft decisions may be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id;
  GET DIAGNOSTICS v_cleared_ffe = ROW_COUNT;

  UPDATE public.project_tasks
  SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
  WHERE blocked_by_item_id = p_decision_id;
  GET DIAGNOSTICS v_cleared_tasks = ROW_COUNT;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  DELETE FROM public.client_decisions WHERE id = p_decision_id;
  PERFORM set_config('app.client_decision_write_id', '', true);

  RETURN jsonb_build_object(
    'deleted_decision_id', p_decision_id,
    'project_id', v_decision.project_id,
    'designer_client_id', v_decision.designer_client_id,
    'cleared_ffe_items', v_cleared_ffe,
    'cleared_tasks', v_cleared_tasks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_decision_draft(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_decision_draft(uuid)
  TO authenticated;

-- ── Canonical decision apply paths (client, override, coordination) ─────────

CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_selected_option_id uuid;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id, v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_client_decision_authorized(
  uuid, uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

-- Compatibility entry point retained for installed/rollback callers. Clients
-- may attribute only themselves. A studio override may attribute only the
-- addressed client and must already have the matching audited override row
-- created by the legacy flow.
CREATE OR REPLACE FUNCTION public.apply_decision(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_selected_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_designer_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT relationship.client_id, decision.designer_id
  INTO v_client_id, v_designer_id
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
  FOR UPDATE OF decision
  FOR SHARE OF relationship;

  IF v_client_id IS NOT DISTINCT FROM v_actor THEN
    IF p_selected_by IS NOT NULL AND p_selected_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'p_selected_by must match the authenticated client'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM public._apply_client_decision_authorized(
      p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
    RETURN;
  END IF;

  IF public._can_author_proposal(v_designer_id)
     AND p_selected_by IS NOT DISTINCT FROM v_client_id
     AND EXISTS (
       SELECT 1
       FROM public.decision_overrides AS override
       WHERE override.decision_id = p_decision_id
         AND override.option_id = p_selected_option_id
         AND override.acted_by = v_actor
     )
  THEN
    PERFORM public._apply_client_decision_authorized(
      p_decision_id, p_selected_option_id, v_client_id,
      NULL, NULL, NULL, NULL
    );
    RETURN;
  END IF;

  RAISE EXCEPTION
    'apply_decision requires the addressed client or an audited studio override'
    USING ERRCODE = 'insufficient_privilege';

END;
$$;

REVOKE ALL ON FUNCTION public.apply_decision(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_decision(uuid, uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_client_decision(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
  FOR UPDATE OF decision
  FOR SHARE OF relationship;

  IF v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the addressed client may apply this decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor,
    p_client_consent_method, p_client_signature, p_client_note, p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_decision_override(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_consent_method text,
  p_consent_evidence text
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_decision_override requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_consent_method NOT IN ('verbal', 'written', 'text_excerpt', 'email_excerpt')
     OR btrim(COALESCE(p_consent_evidence, '')) = ''
  THEN
    RAISE EXCEPTION 'valid override consent evidence is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A retry of the already-winning override is a read-only receipt. Do not add
  -- duplicate evidence rows; a different winner is rejected by the locked core.
  IF v_decision.status = 'responded' THEN
    RETURN public._apply_client_decision_authorized(
      p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be overridden from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.decision_overrides (
    decision_id, option_id, acted_by, consent_method, consent_evidence
  ) VALUES (
    p_decision_id, p_selected_option_id, v_actor,
    p_consent_method, btrim(p_consent_evidence)
  );

  RETURN public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_decision_override(uuid, uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_decision_override(uuid, uuid, text, text)
  TO authenticated;

-- ── Coordination resolution: actual caller, exact row, same-tx cascade ─────

CREATE OR REPLACE FUNCTION public.may_resolve_coordination_item(
  item public.client_decisions,
  actor uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_client uuid;
BEGIN
  IF actor IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(item.designer_id, relationship.designer_id),
         relationship.client_id
  INTO v_owner, v_client
  FROM public.designer_clients AS relationship
  WHERE relationship.id = item.designer_client_id;

  IF item.project_id IS NOT NULL THEN
    SELECT COALESCE(v_owner, project.designer_id)
    INTO v_owner
    FROM public.projects AS project
    WHERE project.id = item.project_id;
  END IF;

  -- Browser acts are attributed to the real JWT actor. The canonical studio
  -- author helper admits only the exact owner or an active non-guest peer in
  -- the same active design_studio. A service-only field act may explicitly
  -- attribute the owning designer recorded by apply_field_effect.
  IF actor = auth.uid() AND public._can_author_proposal(v_owner) THEN
    RETURN true;
  END IF;
  IF COALESCE(auth.role(), '') = 'service_role' AND actor = v_owner THEN
    RETURN true;
  END IF;

  RETURN actor = auth.uid()
    AND actor = v_client
    AND item.court = 'client'
    AND item.coordination_kind IN ('selection', 'signoff');
END;
$$;

REVOKE ALL ON FUNCTION public.may_resolve_coordination_item(
  public.client_decisions, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_coordination_revision(
  p_item_id uuid,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT NULL,
  p_status text DEFAULT 'submitted',
  p_submitted_by uuid DEFAULT NULL
)
RETURNS public.coordination_item_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid;
  v_next_rev integer;
  v_revision public.coordination_item_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_actor := auth.uid();
  ELSIF COALESCE(auth.role(), '') = 'service_role' THEN
    v_actor := p_submitted_by;
  ELSE
    RAISE EXCEPTION 'submit_coordination_revision requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind <> 'submittal' THEN
    RAISE EXCEPTION 'item % is not a submittal (coordination_kind = %)',
      p_item_id, v_item.coordination_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'submittal revisions require a pending item'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_status, 'submitted') NOT IN ('submitted', 'revise_resubmit') THEN
    RAISE EXCEPTION 'revision submit status must be submitted or revise_resubmit'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.may_resolve_coordination_item(v_item, v_actor) THEN
    RAISE EXCEPTION 'not authorized to record a revision on item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(max(revision.rev_number), 0) + 1
  INTO v_next_rev
  FROM public.coordination_item_revisions AS revision
  WHERE revision.decision_id = p_item_id;

  INSERT INTO public.coordination_item_revisions (
    decision_id, rev_number, status, attachments, note, submitted_by
  ) VALUES (
    p_item_id, v_next_rev, COALESCE(p_status, 'submitted'),
    COALESCE(p_attachments, '[]'::jsonb), p_note, v_actor
  )
  RETURNING * INTO v_revision;

  UPDATE public.client_decisions
  SET updated_at = now()
  WHERE id = p_item_id;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_coordination_revision(
  uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_coordination_revision(
  uuid, jsonb, text, text, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public._resolve_coordination_item_authorized(
  p_item_id uuid,
  p_selected_option_id uuid DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_next_court text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid := p_actor;
  v_next text;
  v_owner uuid;
  v_client uuid;
  v_authorized_author boolean := false;
  v_retry_authorized boolean := false;
  v_selected_option_id uuid;
  v_approved_revision_id uuid;
  v_revision_status text;
BEGIN
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'coordination resolution requires an actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(v_item.designer_id, relationship.designer_id),
         relationship.client_id
  INTO v_owner, v_client
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_item.designer_client_id;

  v_authorized_author := v_actor = v_owner OR EXISTS (
    SELECT 1
    FROM public.organization_members AS actor_membership
    JOIN public.organization_members AS owner_membership
      ON owner_membership.organization_id = actor_membership.organization_id
    JOIN public.organizations AS organization
      ON organization.id = actor_membership.organization_id
    WHERE actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
      AND owner_membership.user_id = v_owner
      AND owner_membership.status = 'active'
      AND owner_membership.role <> 'guest'
      AND organization.type = 'design_studio'
      AND organization.status = 'active'
  );

  -- Authorization precedes the idempotent receipt. Otherwise anyone who knew
  -- the UUID of an already-resolved row could use this DEFINER core as a read
  -- bypass after the court had moved.
  v_retry_authorized := v_authorized_author OR v_actor = v_client;

  IF NOT v_retry_authorized THEN
    RAISE EXCEPTION 'not authorized to access coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_next_court IS NOT NULL AND NOT v_authorized_author THEN
    RAISE EXCEPTION 'only an authorized studio author may override next court'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.status = 'responded' THEN
    IF v_item.coordination_kind = 'selection' THEN
      SELECT option.id INTO v_selected_option_id
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_item_id AND option.selected = true
      ORDER BY option.id
      LIMIT 1;
      IF p_selected_option_id IS NULL
         OR p_selected_option_id IS DISTINCT FROM v_selected_option_id
         OR p_answer IS NOT NULL
         OR p_revision_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another selection',
          p_item_id USING ERRCODE = 'serialization_failure';
      END IF;
    ELSIF v_item.coordination_kind = 'rfi' THEN
      IF btrim(COALESCE(p_answer, '')) = ''
         OR btrim(p_answer) IS DISTINCT FROM btrim(COALESCE(v_item.answer, ''))
         OR p_selected_option_id IS NOT NULL
         OR p_revision_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another answer',
          p_item_id USING ERRCODE = 'serialization_failure';
      END IF;
    ELSIF v_item.coordination_kind = 'submittal' THEN
      SELECT revision.id INTO v_approved_revision_id
      FROM public.coordination_item_revisions AS revision
      WHERE revision.decision_id = p_item_id
        AND revision.status = 'approved'
      ORDER BY revision.reviewed_at DESC NULLS LAST, revision.rev_number DESC
      LIMIT 1;
      IF p_revision_id IS NULL
         OR p_revision_id IS DISTINCT FROM v_approved_revision_id
         OR btrim(p_answer) IS DISTINCT FROM btrim(v_item.answer)
         OR p_selected_option_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another revision',
          p_item_id USING ERRCODE = 'serialization_failure';
      END IF;
    ELSIF btrim(p_answer) IS DISTINCT FROM btrim(v_item.answer)
          OR p_selected_option_id IS NOT NULL
          OR p_revision_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'coordination item % was resolved with another answer',
        p_item_id USING ERRCODE = 'serialization_failure';
    END IF;
    IF p_next_court IS NOT NULL
       AND p_next_court IS DISTINCT FROM v_item.court
    THEN
      RAISE EXCEPTION 'coordination item % already moved to another court',
        p_item_id USING ERRCODE = 'serialization_failure';
    END IF;
    PERFORM public._enqueue_decision_notification(
      p_item_id, 'decision_resolved'
    );
    RETURN v_item;
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'coordination item % cannot resolve from status %',
      p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
    v_authorized_author
    OR (
      v_actor = v_client
      AND v_item.court = 'client'
      AND v_item.coordination_kind IN ('selection', 'signoff')
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to resolve coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind = 'selection' THEN
    IF p_selected_option_id IS NULL THEN
      RAISE EXCEPTION 'a selection item requires p_selected_option_id'
        USING ERRCODE = 'check_violation';
    END IF;
    v_item := public._apply_client_decision_authorized(
      p_item_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
  ELSE
    PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);

    IF v_item.coordination_kind = 'rfi' THEN
      IF btrim(COALESCE(p_answer, v_item.answer, '')) = '' THEN
        RAISE EXCEPTION 'an RFI requires a nonblank answer'
          USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.client_decisions
      SET answer = btrim(COALESCE(p_answer, answer)),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSIF v_item.coordination_kind = 'submittal' THEN
      IF p_revision_id IS NULL THEN
        RAISE EXCEPTION 'a submittal requires an eligible revision'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT revision.status INTO v_revision_status
      FROM public.coordination_item_revisions AS revision
      WHERE revision.id = p_revision_id
        AND revision.decision_id = p_item_id
      FOR UPDATE;
      IF NOT FOUND OR v_revision_status NOT IN ('submitted', 'revise_resubmit') THEN
        RAISE EXCEPTION 'revision % is not eligible for submittal %',
          p_revision_id, p_item_id
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE public.coordination_item_revisions
      SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
      WHERE id = p_revision_id;

      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSE
      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = CASE WHEN p_answer IS NOT NULL THEN now() ELSE answered_at END,
          answered_by = CASE WHEN p_answer IS NOT NULL THEN v_actor ELSE answered_by END,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    END IF;

    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_item_id
    AND project_id = v_item.project_id;

  UPDATE public.project_tasks AS task
  SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
  WHERE task.blocked_by_item_id = p_item_id
    AND task.status = 'blocked'
    AND (
      task.seq_after_task_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.project_tasks AS predecessor
        WHERE predecessor.id = task.seq_after_task_id
          AND predecessor.status = 'done'
      )
    );

  v_next := COALESCE(p_next_court, public.next_court_for(v_item));
  PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);
  UPDATE public.client_decisions
  SET court = v_next, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  PERFORM set_config('app.client_decision_write_id', '', true);

  PERFORM public._enqueue_decision_notification(
    p_item_id, 'decision_resolved'
  );

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_coordination_item_authorized(
  uuid, uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_coordination_item(
  p_item_id uuid,
  p_selected_option_id uuid DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_next_court text DEFAULT NULL,
  p_resolved_by uuid DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_calling_role text := current_setting('role', true);
BEGIN
  -- Browser and authenticated review acts are always attributed to auth.uid(),
  -- so the legacy p_resolved_by value cannot spoof stored evidence. The
  -- service-only field/SMS choke point has no login identity and may attribute
  -- its owning designer. A direct postgres maintenance/test session is the
  -- other trusted no-JWT path. current_setting('role') retains the caller role
  -- across this DEFINER boundary, unlike current_user.
  IF auth.uid() IS NOT NULL THEN
    v_actor := auth.uid();
  ELSIF COALESCE(auth.role(), '') = 'service_role'
        AND v_calling_role = 'service_role'
  THEN
    v_actor := p_resolved_by;
  ELSIF session_user IS NOT DISTINCT FROM 'postgres'
        AND COALESCE(v_calling_role, 'none') IN ('none', 'postgres')
  THEN
    v_actor := p_resolved_by;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'resolve_coordination_item requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._resolve_coordination_item_authorized(
    p_item_id,
    p_selected_option_id,
    p_answer,
    p_revision_id,
    p_next_court,
    v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_coordination_item(
  uuid, uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_coordination_item(
  uuid, uuid, text, uuid, text, uuid
) TO authenticated;

-- apply_field_effect is a service/DEFINER-only legacy core. Wrap it so its one
-- direct coordination payload edit (report_delay) carries the exact decision
-- capability; inserts remain clean pending workflow rows and resolution uses
-- resolve_coordination_item above.
DO $rename_apply_field_effect$
BEGIN
  IF to_regprocedure(
       'public._apply_field_effect_legacy_00399(uuid,jsonb,text,uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
      RENAME TO _apply_field_effect_legacy_00399;
  END IF;
END;
$rename_apply_field_effect$;

REVOKE ALL ON FUNCTION public._apply_field_effect_legacy_00399(
  uuid, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id uuid,
  p_effect jsonb,
  p_source text DEFAULT 'sms',
  p_sms_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_result jsonb;
BEGIN
  IF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
    PERFORM set_config('app.client_decision_write_id', v_target_id::text, true);
  END IF;

  v_result := public._apply_field_effect_legacy_00399(
    p_party_id, p_effect, p_source, p_sms_message_id
  );
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  TO service_role;

-- ── Proposal schedule composition is server-serialized ────────────────────

-- Proposal phases feed the one-time proposal→project activation bridge. A
-- disconnected proposal chain therefore is not merely an editor blemish: it
-- becomes a late signing/activation failure. Keep a proposal-side assertion
-- alongside the project assertion introduced in 00398.
CREATE OR REPLACE FUNCTION public._assert_proposal_phase_topology(
  p_proposal_id uuid,
  p_context text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anchor_main_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.proposal_phases AS child
    JOIN public.proposal_phases AS parent
      ON parent.id = child.follows_phase_id
    WHERE (child.proposal_id = p_proposal_id
           OR parent.proposal_id = p_proposal_id)
      AND child.proposal_id IS DISTINCT FROM parent.proposal_id
  ) THEN
    RAISE EXCEPTION '%: cross-proposal phase topology is unsupported', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH RECURSIVE predecessor_walk(phase_id, path, cyclic) AS (
      SELECT phase.id, ARRAY[phase.id]::uuid[], false
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id

      UNION ALL

      SELECT parent.id,
             walk.path || parent.id,
             parent.id = ANY(walk.path)
      FROM predecessor_walk AS walk
      JOIN public.proposal_phases AS child
        ON child.id = walk.phase_id
       AND child.proposal_id = p_proposal_id
      JOIN public.proposal_phases AS parent
        ON parent.id = child.follows_phase_id
       AND parent.proposal_id = p_proposal_id
      WHERE NOT walk.cyclic
    )
    SELECT 1 FROM predecessor_walk WHERE cyclic
  ) THEN
    RAISE EXCEPTION '%: canonical proposal phase topology is cyclic', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id
      AND phase.lane = 'main'
      AND phase.follows_phase_id IS NOT NULL
    GROUP BY phase.follows_phase_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '%: canonical proposal main successor is ambiguous', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT phase.id INTO v_anchor_main_id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
    AND phase.lane = 'main'
  ORDER BY phase.id
  LIMIT 1;

  IF v_anchor_main_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE component(id) AS (
      SELECT v_anchor_main_id

      UNION

      SELECT neighbor.id
      FROM component AS component_row
      JOIN public.proposal_phases AS current_phase
        ON current_phase.id = component_row.id
       AND current_phase.proposal_id = p_proposal_id
      JOIN public.proposal_phases AS neighbor
        ON neighbor.proposal_id = p_proposal_id
       AND (
         neighbor.id = current_phase.follows_phase_id
         OR neighbor.follows_phase_id = current_phase.id
       )
    )
    SELECT 1
    FROM public.proposal_phases AS main_phase
    WHERE main_phase.proposal_id = p_proposal_id
      AND main_phase.lane = 'main'
      AND NOT EXISTS (
        SELECT 1 FROM component WHERE component.id = main_phase.id
      )
  ) THEN
    RAISE EXCEPTION '%: canonical proposal main successor is missing', p_context
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_proposal_phase_topology(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- 00324 introduced predecessor links after proposals were already in use.
-- The only legacy shape that can be repaired without inventing intent is an
-- all-main, all-null graph with a unique authored sort order. Duplicate order
-- or any mixed/partial graph is left untouched and diagnosed so activation
-- continues to fail closed rather than guessing.
CREATE OR REPLACE FUNCTION public._repair_legacy_proposal_phase_topology(
  p_proposal_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_all_main boolean;
  v_all_null boolean;
  v_unique_sort boolean;
BEGIN
  PERFORM proposal.id
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*)::integer,
         COALESCE(bool_and(phase.lane = 'main'), true),
         COALESCE(bool_and(phase.follows_phase_id IS NULL), true),
         count(DISTINCT phase.sort_order) = count(*)
  INTO v_count, v_all_main, v_all_null, v_unique_sort
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id;

  IF v_count <= 1 THEN
    RETURN false;
  END IF;
  IF NOT (v_all_main AND v_all_null AND v_unique_sort) THEN
    RETURN false;
  END IF;

  WITH ordered AS (
    SELECT phase.id,
           lag(phase.id) OVER (
             ORDER BY phase.sort_order, phase.id
           ) AS predecessor_id
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id
  )
  UPDATE public.proposal_phases AS phase
  SET follows_phase_id = ordered.predecessor_id
  FROM ordered
  WHERE phase.id = ordered.id
    AND phase.follows_phase_id IS DISTINCT FROM ordered.predecessor_id;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'legacy proposal phase repair'
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._repair_legacy_proposal_phase_topology(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.proposal_phase_topology_diagnostics (
  proposal_id uuid PRIMARY KEY
    REFERENCES public.proposals(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  phase_count integer NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_phase_topology_diagnostics
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proposal_phase_topology_diagnostics
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.proposal_phase_topology_diagnostics
  TO service_role;

-- Issued proposal children are intentionally immutable. Take a migration DDL
-- lock and suspend only that existing user trigger for this one deterministic
-- normalization pass; any failure rolls the trigger state and writes back.
BEGIN;
LOCK TABLE public.proposal_phases IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.proposal_phases
  DISABLE TRIGGER z_guard_proposal_copy_draft_only_trg;

DO $$
DECLARE
  v_proposal record;
  v_error text;
BEGIN
  FOR v_proposal IN
    SELECT phase.proposal_id, count(*)::integer AS phase_count
    FROM public.proposal_phases AS phase
    GROUP BY phase.proposal_id
    HAVING count(*) > 1
    ORDER BY phase.proposal_id
  LOOP
    PERFORM public._repair_legacy_proposal_phase_topology(
      v_proposal.proposal_id
    );

    BEGIN
      PERFORM public._assert_proposal_phase_topology(
        v_proposal.proposal_id, '00399 migration audit'
      );
      DELETE FROM public.proposal_phase_topology_diagnostics
      WHERE proposal_id = v_proposal.proposal_id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      INSERT INTO public.proposal_phase_topology_diagnostics (
        proposal_id, issue_code, phase_count, detail, detected_at
      ) VALUES (
        v_proposal.proposal_id,
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.proposal_phases AS phase
            WHERE phase.proposal_id = v_proposal.proposal_id
              AND (
                phase.lane <> 'main'
                OR phase.follows_phase_id IS NOT NULL
              )
          ) THEN 'ambiguous_legacy_order'
          ELSE 'invalid_graph'
        END,
        v_proposal.phase_count,
        jsonb_build_object('error', v_error),
        now()
      )
      ON CONFLICT (proposal_id) DO UPDATE
      SET issue_code = EXCLUDED.issue_code,
          phase_count = EXCLUDED.phase_count,
          detail = EXCLUDED.detail,
          detected_at = EXCLUDED.detected_at;
    END;
  END LOOP;
END;
$$;

ALTER TABLE public.proposal_phases
  ENABLE TRIGGER z_guard_proposal_copy_draft_only_trg;
COMMIT;

-- Return the topology-derived main tail, not whichever row happens to carry
-- MAX(sort_order). A main tail has no later main descendant through the
-- follows graph; thread phases may branch after it without becoming the main
-- append point themselves.
CREATE OR REPLACE FUNCTION public._proposal_phase_main_tail(
  p_proposal_id uuid,
  p_context text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tail uuid;
  v_tail_count integer;
BEGIN
  PERFORM public._assert_proposal_phase_topology(p_proposal_id, p_context);

  WITH RECURSIVE descendants(root_id, id) AS (
    SELECT phase.id, phase.id
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id
      AND phase.lane = 'main'

    UNION ALL

    SELECT descendants.root_id, child.id
    FROM descendants
    JOIN public.proposal_phases AS child
      ON child.follows_phase_id = descendants.id
     AND child.proposal_id = p_proposal_id
  ), candidates AS (
    SELECT main_phase.id
    FROM public.proposal_phases AS main_phase
    WHERE main_phase.proposal_id = p_proposal_id
      AND main_phase.lane = 'main'
      AND NOT EXISTS (
        SELECT 1
        FROM descendants
        JOIN public.proposal_phases AS descendant_phase
          ON descendant_phase.id = descendants.id
        WHERE descendants.root_id = main_phase.id
          AND descendants.id <> main_phase.id
          AND descendant_phase.lane = 'main'
      )
  )
  SELECT count(*), (array_agg(id ORDER BY id))[1]
  INTO v_tail_count, v_tail
  FROM candidates;

  IF v_tail_count > 1 THEN
    RAISE EXCEPTION '%: canonical proposal main tail is ambiguous', p_context
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_tail;
END;
$$;

REVOKE ALL ON FUNCTION public._proposal_phase_main_tail(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Browser inserts and direct topology rewrites cannot bypass the checked
-- parent-lock protocol. Non-topology draft edits remain available through the
-- existing proposal child policy/guard.
CREATE OR REPLACE FUNCTION public.guard_proposal_phase_topology_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Expand-phase compatibility: rollback builders still insert draft phases
    -- directly. The earlier draft-only parent guard validates and serializes
    -- that write; this trigger continues to forbid topology rewrites.
    RETURN NEW;
  END IF;
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.lane IS DISTINCT FROM OLD.lane
     OR NEW.follows_phase_id IS DISTINCT FROM OLD.follows_phase_id
  THEN
    RAISE EXCEPTION
      'proposal phase topology may only change through a canonical schedule workflow'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_phase_topology_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS y_guard_proposal_phase_topology_write_trg
  ON public.proposal_phases;
CREATE TRIGGER y_guard_proposal_phase_topology_write_trg
BEFORE INSERT OR UPDATE OF proposal_id, lane, follows_phase_id
ON public.proposal_phases
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_phase_topology_write();

-- Expand phase retains direct draft phase create/edit/remove for rollback
-- bundles; the topology guard above and 00390 draft-only guard remain active.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.proposal_phases FROM anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.proposal_phases TO authenticated;

-- 00316 widened the parent phases/payment schedule to active design-studio
-- peers but missed the three phase-parented child tables. Keep their existing
-- owner policies and add the same exact studio boundary. The 00390 draft-only
-- trigger still serializes and rejects every write after issue.
DROP POLICY IF EXISTS "proposal_phase_deliverables_studio_rw"
  ON public.proposal_phase_deliverables;
CREATE POLICY "proposal_phase_deliverables_studio_rw"
ON public.proposal_phase_deliverables
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_deliverables.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_phase_gates_studio_rw"
  ON public.proposal_phase_gates;
CREATE POLICY "proposal_phase_gates_studio_rw"
ON public.proposal_phase_gates
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_phase_gates.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_schedule_milestones_studio_rw"
  ON public.proposal_schedule_milestones;
CREATE POLICY "proposal_schedule_milestones_studio_rw"
ON public.proposal_schedule_milestones
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_phases AS phase
    JOIN public.proposals AS proposal ON proposal.id = phase.proposal_id
    WHERE phase.id = proposal_schedule_milestones.phase_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_palettes_studio_rw"
  ON public.proposal_palettes;
CREATE POLICY "proposal_palettes_studio_rw"
ON public.proposal_palettes
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_palettes.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_palettes.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "palette_swatches_studio_rw"
  ON public.palette_swatches;
CREATE POLICY "palette_swatches_studio_rw"
ON public.palette_swatches
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proposal_palettes AS palette
    JOIN public.proposals AS proposal ON proposal.id = palette.proposal_id
    WHERE palette.id = palette_swatches.palette_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proposal_palettes AS palette
    JOIN public.proposals AS proposal ON proposal.id = palette.proposal_id
    WHERE palette.id = palette_swatches.palette_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "proposal_team_members_studio_rw"
  ON public.proposal_team_members;
CREATE POLICY "proposal_team_members_studio_rw"
ON public.proposal_team_members
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_team_members.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = proposal_team_members.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS "spec_field_defs_proposal_studio_rw"
  ON public.spec_field_defs;
CREATE POLICY "spec_field_defs_proposal_studio_rw"
ON public.spec_field_defs
FOR ALL TO authenticated
USING (
  proposal_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = spec_field_defs.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  proposal_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.proposals AS proposal
    WHERE proposal.id = spec_field_defs.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

CREATE OR REPLACE FUNCTION public._recompute_proposal_total_locked(
  p_proposal_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  UPDATE public.proposals
  SET total_amount = (
        COALESCE((
          SELECT sum(item.line_total_cents)
          FROM public.proposal_items AS item
          WHERE item.proposal_id = p_proposal_id
        ), 0)
        + COALESCE((
          SELECT sum(phase.fee_cents)
          FROM public.proposal_phases AS phase
          WHERE phase.proposal_id = p_proposal_id
        ), 0)
      )::integer,
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING total_amount INTO v_total;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'proposal % not found while recomputing total', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._recompute_proposal_total_locked(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_proposal_phase(
  p_proposal_id uuid,
  p_name text,
  p_phase_key text DEFAULT NULL,
  p_duration_weeks integer DEFAULT NULL,
  p_fee_cents integer DEFAULT 0,
  p_revision_limit integer DEFAULT 2,
  p_gate_condition text DEFAULT NULL,
  p_deliverables jsonb DEFAULT '[]'::jsonb,
  p_duration_days integer DEFAULT NULL,
  p_anchor_date date DEFAULT NULL,
  p_lane text DEFAULT 'main'
)
RETURNS public.proposal_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_phase public.proposal_phases%ROWTYPE;
  v_tail uuid;
  v_sort integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_proposal_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'phase name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lane IS NULL OR p_lane NOT IN ('main', 'thread') THEN
    RAISE EXCEPTION 'phase lane must be main or thread'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_deliverables IS NULL OR jsonb_typeof(p_deliverables) <> 'array' THEN
    RAISE EXCEPTION 'p_deliverables must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;

  v_tail := public._proposal_phase_main_tail(
    p_proposal_id, 'create_proposal_phase precondition'
  );
  SELECT COALESCE(max(sort_order), -1) + 1 INTO v_sort
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  INSERT INTO public.proposal_phases (
    proposal_id, name, phase_key, duration_weeks, fee_cents,
    revision_limit, gate_condition, deliverables, sort_order,
    duration_days, anchor_date, follows_phase_id, lane
  ) VALUES (
    p_proposal_id, btrim(p_name), NULLIF(btrim(COALESCE(p_phase_key, '')), ''),
    p_duration_weeks, COALESCE(p_fee_cents, 0),
    COALESCE(p_revision_limit, 2),
    NULLIF(btrim(COALESCE(p_gate_condition, '')), ''), p_deliverables, v_sort,
    p_duration_days, p_anchor_date, v_tail, p_lane
  )
  RETURNING * INTO v_phase;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'create_proposal_phase result'
  );

  -- The parent lock also serializes every proposal-child writer through the
  -- draft-copy guard. Recompute the client-facing headline from canonical
  -- children before releasing it so a phase cannot commit without its fee.
  PERFORM public._recompute_proposal_total_locked(p_proposal_id);
  RETURN v_phase;
END;
$$;

REVOKE ALL ON FUNCTION public.create_proposal_phase(
  uuid, text, text, integer, integer, integer, text, jsonb,
  integer, date, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_proposal_phase(
  uuid, text, text, integer, integer, integer, text, jsonb,
  integer, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_proposal_phase(
  p_phase_id uuid,
  p_proposal_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz
)
RETURNS public.proposal_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_phase public.proposal_phases%ROWTYPE;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_proposal_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_patch - ARRAY[
    'name', 'phase_key', 'duration_weeks', 'fee_cents', 'revision_limit',
    'gate_condition', 'deliverables', 'duration_days', 'anchor_date'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported proposal phase patch keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'name'
     AND btrim(COALESCE(p_patch->>'name', '')) = ''
  THEN
    RAISE EXCEPTION 'phase name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_patch ? 'fee_cents' AND p_patch->>'fee_cents' IS NULL THEN
    RAISE EXCEPTION 'phase fee_cents cannot be null'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_patch ? 'deliverables'
     AND (
       p_patch->'deliverables' IS NULL
       OR jsonb_typeof(p_patch->'deliverables') <> 'array'
     )
  THEN
    RAISE EXCEPTION 'phase deliverables must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_phase
  FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal phase % not found in proposal %',
      p_phase_id, p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_phase.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'proposal phase % changed since it was loaded', p_phase_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.proposal_phases
  SET name = CASE WHEN p_patch ? 'name'
        THEN btrim(p_patch->>'name') ELSE name END,
      phase_key = CASE WHEN p_patch ? 'phase_key'
        THEN NULLIF(btrim(COALESCE(p_patch->>'phase_key', '')), '')
        ELSE phase_key END,
      duration_weeks = CASE WHEN p_patch ? 'duration_weeks'
        THEN NULLIF(p_patch->>'duration_weeks', '')::integer
        ELSE duration_weeks END,
      fee_cents = CASE WHEN p_patch ? 'fee_cents'
        THEN (p_patch->>'fee_cents')::integer ELSE fee_cents END,
      revision_limit = CASE WHEN p_patch ? 'revision_limit'
        THEN NULLIF(p_patch->>'revision_limit', '')::integer
        ELSE revision_limit END,
      gate_condition = CASE WHEN p_patch ? 'gate_condition'
        THEN NULLIF(btrim(COALESCE(p_patch->>'gate_condition', '')), '')
        ELSE gate_condition END,
      deliverables = CASE WHEN p_patch ? 'deliverables'
        THEN p_patch->'deliverables' ELSE deliverables END,
      duration_days = CASE WHEN p_patch ? 'duration_days'
        THEN NULLIF(p_patch->>'duration_days', '')::integer
        ELSE duration_days END,
      anchor_date = CASE WHEN p_patch ? 'anchor_date'
        THEN NULLIF(p_patch->>'anchor_date', '')::date ELSE anchor_date END,
      updated_at = now()
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id
  RETURNING * INTO v_phase;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'update_proposal_phase result'
  );
  PERFORM public._recompute_proposal_total_locked(p_proposal_id);
  RETURN v_phase;
END;
$$;

REVOKE ALL ON FUNCTION public.update_proposal_phase(
  uuid, uuid, jsonb, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_proposal_phase(
  uuid, uuid, jsonb, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_proposal_phase(
  p_phase_id uuid,
  p_proposal_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS public.proposal_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_phase public.proposal_phases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'remove_proposal_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'remove_proposal_phase precondition'
  );

  SELECT * INTO v_phase
  FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal phase % not found in proposal %',
      p_phase_id, p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_phase.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'proposal phase % changed since it was loaded', p_phase_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Preserve every direct branch. A main successor takes the deleted phase's
  -- predecessor; thread children are re-anchored to the same predecessor.
  UPDATE public.proposal_phases
  SET follows_phase_id = v_phase.follows_phase_id,
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND follows_phase_id = p_phase_id;

  DELETE FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'remove_proposal_phase result'
  );
  PERFORM public._recompute_proposal_total_locked(p_proposal_id);
  RETURN v_phase;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_proposal_phase(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.remove_proposal_phase(
  uuid, uuid, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public._proposal_phase_effect_snapshot(
  p_proposal_id uuid,
  p_phase_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'phase', to_jsonb(phase) - ARRAY['created_at', 'updated_at'],
        'deliverables', COALESCE((
          SELECT jsonb_agg(
            to_jsonb(deliverable) - ARRAY['created_at', 'updated_at']
            ORDER BY deliverable.sort_order, deliverable.id
          )
          FROM public.proposal_phase_deliverables AS deliverable
          WHERE deliverable.phase_id = phase.id
        ), '[]'::jsonb),
        'gates', COALESCE((
          SELECT jsonb_agg(
            to_jsonb(gate) - ARRAY['created_at', 'updated_at']
            ORDER BY gate.sort_order, gate.id
          )
          FROM public.proposal_phase_gates AS gate
          WHERE gate.phase_id = phase.id
        ), '[]'::jsonb)
      )
      ORDER BY requested.ordinal
    ),
    '[]'::jsonb
  )
  FROM unnest(COALESCE(p_phase_ids, '{}'::uuid[]))
       WITH ORDINALITY AS requested(phase_id, ordinal)
  JOIN public.proposal_phases AS phase
    ON phase.id = requested.phase_id
   AND phase.proposal_id = p_proposal_id
$$;

REVOKE ALL ON FUNCTION public._proposal_phase_effect_snapshot(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.proposal_phase_template_applications (
  request_id uuid NOT NULL,
  proposal_id uuid NOT NULL
    REFERENCES public.proposals(id) ON DELETE CASCADE,
  template_slug text NOT NULL,
  phase_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  effect_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, request_id)
);

ALTER TABLE public.proposal_phase_template_applications
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proposal_phase_template_applications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.proposal_phase_template_applications
  TO service_role;

-- 00324 lineage, now with one locked parent protocol, canonical studio
-- authority, and a durable request receipt. Existing phases are preserved and
-- every template append begins at the topology-derived main tail. The sole
-- legacy repair recognizes the exact historical Add Defaults prefix (1..5
-- rows, including fee/revision values, all null-follow), links those rows, and
-- inserts only that historical list's missing suffix. Arbitrary disconnected
-- user branches fail closed instead of being silently rewritten.
CREATE OR REPLACE FUNCTION public.apply_phase_template(
  p_proposal_id uuid,
  p_template_slug text,
  p_request_id uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_template public.phase_templates%ROWTYPE;
  v_receipt public.proposal_phase_template_applications%ROWTYPE;
  v_phase_data jsonb;
  v_phase_id uuid;
  v_prev_phase_id uuid;
  v_deliverable jsonb;
  v_gate jsonb;
  v_max_sort integer;
  v_existing_count integer;
  v_prefix_mismatch_count integer;
  v_recovered_prefix_count integer := 0;
  v_existing record;
  v_inserted_phase_ids uuid[] := '{}'::uuid[];
  v_effect_phase_ids uuid[] := '{}'::uuid[];
  v_effective_phases jsonb;
  v_legacy_default_phases jsonb := '[
    {
      "name":"Schematic Design",
      "phase_key":"concept_development",
      "duration_weeks":3,
      "fee_cents":250000,
      "revision_limit":2
    },
    {
      "name":"Design Development",
      "phase_key":"design_refinement",
      "duration_weeks":4,
      "fee_cents":350000,
      "revision_limit":2
    },
    {
      "name":"Procurement Management",
      "phase_key":"procurement",
      "duration_weeks":8,
      "fee_cents":200000,
      "revision_limit":1
    },
    {
      "name":"Installation & Styling",
      "phase_key":"installation",
      "duration_weeks":3,
      "fee_cents":150000,
      "revision_limit":1
    },
    {
      "name":"Completion & Handover",
      "phase_key":"final_walkthrough",
      "duration_weeks":1,
      "fee_cents":50000,
      "revision_limit":0
    }
  ]'::jsonb;
  v_return_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_phase_template requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.template_slug IS DISTINCT FROM p_template_slug
       OR EXISTS (
         SELECT 1
         FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.proposal_phases AS phase
           WHERE phase.id = receipt_phase.id
             AND phase.proposal_id = p_proposal_id
         )
       )
       OR v_receipt.effect_snapshot IS DISTINCT FROM
            public._proposal_phase_effect_snapshot(
              p_proposal_id, v_receipt.phase_ids
            )
    THEN
      RAISE EXCEPTION 'template request % conflicts with its recorded effect',
        p_request_id
        USING ERRCODE = 'serialization_failure';
    END IF;
    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  -- A named template is one compositional act per proposal, even when two
  -- browser tabs initiate that act with different request UUIDs. The proposal
  -- row lock above serializes both callers. Preserve the later request as an
  -- alias to the first durable effect so its retries remain exact as well.
  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND template_slug = p_template_slug
  ORDER BY created_at, request_id
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.proposal_phases AS phase
        WHERE phase.id = receipt_phase.id
          AND phase.proposal_id = p_proposal_id
      )
    ) OR v_receipt.effect_snapshot IS DISTINCT FROM
           public._proposal_phase_effect_snapshot(
             p_proposal_id, v_receipt.phase_ids
           )
    THEN
      RAISE EXCEPTION
        'template % was already applied but its recorded effect changed',
        p_template_slug
        USING ERRCODE = 'serialization_failure';
    END IF;

    INSERT INTO public.proposal_phase_template_applications (
      request_id, proposal_id, template_slug, phase_ids,
      effect_snapshot, created_by
    ) VALUES (
      p_request_id, p_proposal_id, p_template_slug,
      v_receipt.phase_ids, v_receipt.effect_snapshot, v_actor
    );

    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_template
  FROM public.phase_templates
  WHERE slug = p_template_slug
    AND (is_system OR designer_id = v_actor);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_template.phases) <> 'array'
     OR jsonb_array_length(v_template.phases) = 0
  THEN
    RAISE EXCEPTION 'template % has no valid phases', p_template_slug
      USING ERRCODE = 'check_violation';
  END IF;
  v_effective_phases := v_template.phases;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_existing_count
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  IF p_template_slug = 'patina_six'
     AND v_existing_count BETWEEN 1 AND 5
  THEN
    WITH ordered_existing AS (
      SELECT phase.*,
             row_number() OVER (ORDER BY phase.sort_order, phase.id) AS ordinal,
             lag(phase.id) OVER (
               ORDER BY phase.sort_order, phase.id
             ) AS expected_predecessor_id,
             bool_and(phase.follows_phase_id IS NULL) OVER () AS all_null_legacy
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id
    )
    SELECT count(*) INTO v_prefix_mismatch_count
    FROM ordered_existing AS existing
    JOIN LATERAL (
      SELECT blueprint.value
      FROM jsonb_array_elements(v_legacy_default_phases)
           WITH ORDINALITY AS blueprint(value, ordinal)
      WHERE blueprint.ordinal = existing.ordinal
    ) AS expected ON true
    WHERE existing.lane <> 'main'
       OR (
         NOT existing.all_null_legacy
         AND existing.follows_phase_id
               IS DISTINCT FROM existing.expected_predecessor_id
       )
       OR existing.sort_order <> existing.ordinal - 1
       OR existing.name IS DISTINCT FROM expected.value->>'name'
       OR existing.phase_key IS DISTINCT FROM expected.value->>'phase_key'
       OR existing.duration_weeks IS DISTINCT FROM
            (expected.value->>'duration_weeks')::integer
       OR existing.duration_days IS NOT NULL
       OR existing.fee_cents IS DISTINCT FROM
            (expected.value->>'fee_cents')::integer
       OR existing.revision_limit IS DISTINCT FROM
            (expected.value->>'revision_limit')::integer;

    IF v_prefix_mismatch_count = 0 THEN
      v_prev_phase_id := NULL;
      FOR v_existing IN
        SELECT phase.id
        FROM public.proposal_phases AS phase
        WHERE phase.proposal_id = p_proposal_id
        ORDER BY phase.sort_order, phase.id
      LOOP
        UPDATE public.proposal_phases
        SET follows_phase_id = v_prev_phase_id
        WHERE id = v_existing.id;
        v_prev_phase_id := v_existing.id;
      END LOOP;
      v_recovered_prefix_count := v_existing_count;
      v_effective_phases := v_legacy_default_phases;
    END IF;
  END IF;

  IF v_recovered_prefix_count = 0 THEN
    v_prev_phase_id := public._proposal_phase_main_tail(
      p_proposal_id, 'apply_phase_template precondition'
    );
  ELSE
    PERFORM public._assert_proposal_phase_topology(
      p_proposal_id, 'apply_phase_template recovered prefix'
    );
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_max_sort
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  FOR v_phase_data IN
    SELECT blueprint.value
    FROM jsonb_array_elements(v_effective_phases)
         WITH ORDINALITY AS blueprint(value, ordinal)
    WHERE blueprint.ordinal > v_recovered_prefix_count
    ORDER BY blueprint.ordinal
  LOOP
    IF btrim(COALESCE(v_phase_data->>'name', '')) = '' THEN
      RAISE EXCEPTION 'every template phase requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
    v_max_sort := v_max_sort + 1;

    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days, lane,
      follows_phase_id, fee_cents, revision_limit, sort_order
    ) VALUES (
      p_proposal_id,
      btrim(v_phase_data->>'name'),
      NULLIF(v_phase_data->>'phase_key', ''),
      NULLIF(v_phase_data->>'duration_weeks', '')::integer,
      NULLIF(v_phase_data->>'duration_days', '')::integer,
      COALESCE(NULLIF(v_phase_data->>'lane', ''), 'main'),
      v_prev_phase_id,
      COALESCE(NULLIF(v_phase_data->>'fee_cents', '')::integer, 0),
      COALESCE(NULLIF(v_phase_data->>'revision_limit', '')::integer, 0),
      v_max_sort
    )
    RETURNING id INTO v_phase_id;

    v_inserted_phase_ids := array_append(v_inserted_phase_ids, v_phase_id);
    v_prev_phase_id := v_phase_id;

    IF v_phase_data ? 'deliverables' THEN
      FOR v_deliverable IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'deliverables')
      LOOP
        INSERT INTO public.proposal_phase_deliverables (
          phase_id, label, description, is_required, sort_order
        ) VALUES (
          v_phase_id,
          v_deliverable->>'label',
          v_deliverable->>'description',
          COALESCE((v_deliverable->>'is_required')::boolean, true),
          COALESCE((v_deliverable->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;

    IF v_phase_data ? 'default_gates' THEN
      FOR v_gate IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'default_gates')
      LOOP
        INSERT INTO public.proposal_phase_gates (
          phase_id, gate_kind, payload, sort_order
        ) VALUES (
          v_phase_id,
          v_gate->>'gate_kind',
          COALESCE(v_gate->'payload', '{}'::jsonb),
          COALESCE((v_gate->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'apply_phase_template result'
  );

  IF v_recovered_prefix_count > 0 THEN
    SELECT COALESCE(
             array_agg(phase.id ORDER BY phase.sort_order, phase.id),
             '{}'::uuid[]
           )
    INTO v_effect_phase_ids
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id;
  ELSE
    v_effect_phase_ids := v_inserted_phase_ids;
  END IF;

  PERFORM public._recompute_proposal_total_locked(p_proposal_id);

  INSERT INTO public.proposal_phase_template_applications (
    request_id, proposal_id, template_slug, phase_ids,
    effect_snapshot, created_by
  ) VALUES (
    p_request_id, p_proposal_id, p_template_slug,
    v_effect_phase_ids,
    public._proposal_phase_effect_snapshot(
      p_proposal_id, v_effect_phase_ids
    ),
    v_actor
  );

  FOREACH v_return_id IN ARRAY v_effect_phase_ids LOOP
    RETURN NEXT v_return_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_phase_template(uuid, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_phase_template(uuid, text, uuid)
  TO authenticated;

-- Backward-compatible internal/older-client bridge. New browser code supplies
-- a stable request UUID to the three-argument form so a lost response retries
-- the receipt instead of duplicating scope and fees.
CREATE OR REPLACE FUNCTION public.apply_phase_template(
  p_proposal_id uuid,
  p_template_slug text
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.apply_phase_template(
    p_proposal_id, p_template_slug, gen_random_uuid()
  )
$$;

REVOKE ALL ON FUNCTION public.apply_phase_template(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_phase_template(uuid, text)
  TO authenticated;

-- 00398 copy lineage with the proposal leg brought under the same canonical
-- studio/draft/topology/total boundary as the other phase birth paths. Because
-- copying is an empty-target birth act, an exact already-materialized target
-- is its idempotent receipt; any other nonempty target still fails closed.
CREATE OR REPLACE FUNCTION public.copy_schedule_as_built(
  p_source_project_id uuid,
  p_target_proposal_id uuid DEFAULT NULL,
  p_target_project_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source_project public.projects%ROWTYPE;
  v_target_project public.projects%ROWTYPE;
  v_target_proposal public.proposals%ROWTYPE;
  v_src record;
  v_duration integer;
  v_new_phase_id uuid;
  v_prev_phase_id uuid := NULL;
  v_sort integer := -1;
  v_source_count integer;
  v_exact_replay boolean := false;
  v_return_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'copy_schedule_as_built requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_target_proposal_id IS NULL) = (p_target_project_id IS NULL) THEN
    RAISE EXCEPTION
      'exactly one of p_target_proposal_id / p_target_project_id must be provided'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_target_project_id IS NOT NULL THEN
    PERFORM project.id
    FROM public.projects AS project
    WHERE project.id IN (p_source_project_id, p_target_project_id)
    ORDER BY project.id
    FOR UPDATE;

    SELECT * INTO v_source_project
    FROM public.projects WHERE id = p_source_project_id;
    SELECT * INTO v_target_project
    FROM public.projects WHERE id = p_target_project_id;

    IF v_source_project.id IS NULL
       OR NOT public._can_author_proposal(v_source_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: source project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_target_project.id IS NULL
       OR NOT public._can_author_proposal(v_target_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: target project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_phases
      WHERE project_id = p_target_project_id
    ) THEN
      RAISE EXCEPTION
        'target project % already has phases; the schedule is never rebuilt (R100)',
        p_target_project_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_source_project
    FROM public.projects
    WHERE id = p_source_project_id
    FOR UPDATE;
    IF NOT FOUND
       OR NOT public._can_author_proposal(v_source_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: source project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_target_proposal
    FROM public.proposals
    WHERE id = p_target_proposal_id
    FOR UPDATE;
    IF NOT FOUND
       OR NOT public._can_author_proposal(v_target_proposal.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: target proposal not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_target_proposal.status <> 'draft' THEN
      RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
        p_target_proposal_id, v_target_proposal.status
        USING ERRCODE = 'check_violation';
    END IF;

    PERFORM phase.id
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_target_proposal_id
    ORDER BY phase.id
    FOR UPDATE;
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_source_project_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_project_phase_topology(
    p_source_project_id, 'copy_schedule_as_built source'
  );
  SELECT count(*) INTO v_source_count
  FROM public.project_phases
  WHERE project_id = p_source_project_id;
  IF v_source_count = 0 THEN
    RAISE EXCEPTION 'source project % has no phases to copy', p_source_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_target_proposal_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.proposal_phases
       WHERE proposal_id = p_target_proposal_id
     )
  THEN
    PERFORM public._assert_proposal_phase_topology(
      p_target_proposal_id, 'copy_schedule_as_built existing receipt'
    );
    WITH source_rows AS (
      SELECT
        row_number() OVER (ORDER BY phase.sort_order, phase.id) AS ordinal,
        phase.name,
        phase.phase_key,
        CASE
          WHEN phase.start_date IS NOT NULL
           AND COALESCE(phase.completed_at::date, phase.target_end_date) IS NOT NULL
          THEN GREATEST(
            1,
            COALESCE(phase.completed_at::date, phase.target_end_date)
              - phase.start_date
          )
          ELSE COALESCE(
            phase.duration_days, phase.duration_weeks * 7, 14
          )
        END AS duration_days,
        COALESCE(phase.lane, 'main') AS lane
      FROM public.project_phases AS phase
      WHERE phase.project_id = p_source_project_id
    ), target_rows AS (
      SELECT
        row_number() OVER (ORDER BY phase.sort_order, phase.id) AS ordinal,
        phase.*,
        lag(phase.id) OVER (ORDER BY phase.sort_order, phase.id) AS prior_id
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_target_proposal_id
    )
    SELECT
      (SELECT count(*) FROM source_rows)
        = (SELECT count(*) FROM target_rows)
      AND NOT EXISTS (
        SELECT 1
        FROM source_rows AS source
        FULL JOIN target_rows AS target USING (ordinal)
        WHERE source.ordinal IS NULL
           OR target.ordinal IS NULL
           OR target.name IS DISTINCT FROM source.name
           OR target.phase_key IS DISTINCT FROM source.phase_key
           OR target.duration_days IS DISTINCT FROM source.duration_days
           OR target.lane IS DISTINCT FROM source.lane
           OR target.sort_order IS DISTINCT FROM source.ordinal - 1
           OR target.follows_phase_id IS DISTINCT FROM
                CASE WHEN source.ordinal = 1 THEN NULL ELSE target.prior_id END
      )
    INTO v_exact_replay;

    IF NOT v_exact_replay THEN
      RAISE EXCEPTION
        'target proposal % already has a different schedule; it is never rebuilt (R100)',
        p_target_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;

    PERFORM public._recompute_proposal_total_locked(p_target_proposal_id);
    FOR v_return_id IN
      SELECT phase.id
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_target_proposal_id
      ORDER BY phase.sort_order, phase.id
    LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  FOR v_src IN
    SELECT *
    FROM public.project_phases
    WHERE project_id = p_source_project_id
    ORDER BY sort_order, id
  LOOP
    v_sort := v_sort + 1;
    IF v_src.start_date IS NOT NULL
       AND COALESCE(v_src.completed_at::date, v_src.target_end_date) IS NOT NULL
    THEN
      v_duration := GREATEST(
        1,
        COALESCE(v_src.completed_at::date, v_src.target_end_date)
          - v_src.start_date
      );
    ELSE
      v_duration := COALESCE(
        v_src.duration_days, v_src.duration_weeks * 7, 14
      );
    END IF;

    IF p_target_proposal_id IS NOT NULL THEN
      INSERT INTO public.proposal_phases (
        proposal_id, name, phase_key, duration_days, lane,
        follows_phase_id, sort_order
      ) VALUES (
        p_target_proposal_id, v_src.name, v_src.phase_key, v_duration,
        COALESCE(v_src.lane, 'main'), v_prev_phase_id, v_sort
      )
      RETURNING id INTO v_new_phase_id;
    ELSE
      SELECT created.id INTO v_new_phase_id
      FROM public.create_project_phase(
        p_project_id => p_target_project_id,
        p_phase_key => v_src.phase_key,
        p_name => v_src.name,
        p_sort_order => v_sort,
        p_duration_days => v_duration,
        p_follows_phase_id => v_prev_phase_id,
        p_lane => COALESCE(v_src.lane, 'main')
      ) AS created;
    END IF;

    RETURN NEXT v_new_phase_id;
    v_prev_phase_id := v_new_phase_id;
  END LOOP;

  IF p_target_proposal_id IS NOT NULL THEN
    PERFORM public._assert_proposal_phase_topology(
      p_target_proposal_id, 'copy_schedule_as_built result'
    );
    PERFORM public._recompute_proposal_total_locked(p_target_proposal_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_schedule_as_built(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.copy_schedule_as_built(uuid, uuid, uuid)
  TO authenticated;

-- 00327's deep-copy implementation remains the source of truth for every
-- non-schedule child table, but it was SECURITY INVOKER and predated linked
-- proposal phases. Freeze it as a private implementation, then expose one
-- checked wrapper that reconstructs the cloned schedule with the complete
-- old→new predecessor map before returning the draft.
ALTER FUNCTION public.clone_proposal(uuid, text, text)
  RENAME TO _clone_proposal_legacy_00399;
REVOKE ALL ON FUNCTION public._clone_proposal_legacy_00399(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clone_proposal(
  p_source_id uuid,
  p_mode text DEFAULT 'revision',
  p_revision_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.proposals%ROWTYPE;
  v_target public.proposals%ROWTYPE;
  v_new_id uuid;
  v_new_phase_id uuid;
  v_phase_map jsonb := '{}'::jsonb;
  v_phase record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'clone_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mode NOT IN ('revision', 'duplicate') THEN
    RAISE EXCEPTION
      'clone_proposal: invalid mode %, expected revision|duplicate', p_mode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_source
  FROM public.proposals
  WHERE id = p_source_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_source.designer_id) THEN
    RAISE EXCEPTION
      'clone_proposal: proposal % not found or access denied', p_source_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_source_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_proposal_phase_topology(
    p_source_id, 'clone_proposal source'
  );

  v_new_id := public._clone_proposal_legacy_00399(
    p_source_id, p_mode, p_revision_summary
  );

  SELECT * INTO STRICT v_target
  FROM public.proposals
  WHERE id = v_new_id
  FOR UPDATE;
  IF v_target.status <> 'draft'
     OR v_target.designer_id IS DISTINCT FROM v_source.designer_id
  THEN
    RAISE EXCEPTION 'clone_proposal produced an invalid target draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The frozen implementation created pre-linkage phase rows and copied their
  -- dependent deliverables/gates/payment milestones. Remove only that target
  -- schedule material, then rebuild it from the locked source with every
  -- current chain field. Other deep-copy children remain exactly as 00327.
  DELETE FROM public.proposal_schedule_milestones AS milestone
  USING public.proposal_phases AS phase
  WHERE milestone.phase_id = phase.id
    AND phase.proposal_id = v_new_id;
  DELETE FROM public.proposal_payment_milestones
  WHERE proposal_id = v_new_id;
  DELETE FROM public.proposal_phases
  WHERE proposal_id = v_new_id;

  FOR v_phase IN
    SELECT *
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days,
      fee_cents, revision_limit, gate_condition, deliverables,
      sort_order, follows_phase_id, anchor_date, lane
    ) VALUES (
      v_new_id, v_phase.name, v_phase.phase_key, v_phase.duration_weeks,
      v_phase.duration_days, v_phase.fee_cents, v_phase.revision_limit,
      v_phase.gate_condition, v_phase.deliverables, v_phase.sort_order,
      NULL, v_phase.anchor_date, v_phase.lane
    )
    RETURNING id INTO v_new_phase_id;
    v_phase_map := v_phase_map || jsonb_build_object(
      v_phase.id::text, v_new_phase_id::text
    );
  END LOOP;

  FOR v_phase IN
    SELECT id, follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    UPDATE public.proposal_phases
    SET follows_phase_id = CASE
      WHEN v_phase.follows_phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> v_phase.follows_phase_id::text)::uuid
    END
    WHERE id = (v_phase_map ->> v_phase.id::text)::uuid;
  END LOOP;

  INSERT INTO public.proposal_phase_deliverables (
    phase_id, label, description, is_required,
    completed_at, completed_by, sort_order
  )
  SELECT
    (v_phase_map ->> deliverable.phase_id::text)::uuid,
    deliverable.label, deliverable.description, deliverable.is_required,
    NULL, NULL, deliverable.sort_order
  FROM public.proposal_phase_deliverables AS deliverable
  JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? deliverable.phase_id::text;

  INSERT INTO public.proposal_phase_gates (
    phase_id, gate_kind, payload, satisfied_at, satisfied_by,
    override_reason, sort_order
  )
  SELECT
    (v_phase_map ->> gate.phase_id::text)::uuid,
    gate.gate_kind, gate.payload, NULL, NULL, NULL, gate.sort_order
  FROM public.proposal_phase_gates AS gate
  JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? gate.phase_id::text;

  INSERT INTO public.proposal_payment_milestones (
    proposal_id, phase_id, label, percentage, amount_cents,
    trigger_condition, sort_order
  )
  SELECT
    v_new_id,
    CASE
      WHEN milestone.phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> milestone.phase_id::text)::uuid
    END,
    milestone.label, milestone.percentage, milestone.amount_cents,
    milestone.trigger_condition, milestone.sort_order
  FROM public.proposal_payment_milestones AS milestone
  WHERE milestone.proposal_id = p_source_id;

  INSERT INTO public.proposal_schedule_milestones (
    phase_id, name, kind, anchor_date, sort_order
  )
  SELECT
    (v_phase_map ->> milestone.phase_id::text)::uuid,
    milestone.name, milestone.kind, milestone.anchor_date,
    milestone.sort_order
  FROM public.proposal_schedule_milestones AS milestone
  JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? milestone.phase_id::text;

  PERFORM public._assert_proposal_phase_topology(
    v_new_id, 'clone_proposal target'
  );
  PERFORM public._recompute_proposal_total_locked(v_new_id);
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_proposal(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.clone_proposal(uuid, text, text)
  TO authenticated;

-- ── Signature paths bind the proposal's exact relationship ─────────────────

-- Engagement rows are client-writeable for ordinary telemetry such as opens
-- and section views. Signature event names, however, are durable acceptance
-- evidence and may only be minted by the exact canonical signature insert.
-- Preallocating the engagement UUID gives the trigger a row-scoped fact in
-- addition to the SECURITY DEFINER identity; a browser-set custom GUC alone is
-- insufficient because its table write still executes as authenticated.
CREATE OR REPLACE FUNCTION public.guard_proposal_signature_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_reserved boolean := TG_OP <> 'INSERT'
    AND OLD.event_type IN ('signed', 'signed_offline');
  v_new_reserved boolean := TG_OP <> 'DELETE'
    AND NEW.event_type IN ('signed', 'signed_offline');
BEGIN
  IF TG_OP = 'INSERT' AND v_new_reserved THEN
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting(
            'app.proposal_signature_engagement_id', true
          ) IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION
        'signature engagement may only be created by a canonical signature workflow'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND (v_old_reserved OR v_new_reserved) THEN
    RAISE EXCEPTION 'signature engagement evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_signature_engagement()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS z_guard_proposal_signature_engagement_trg
  ON public.proposal_engagement;
CREATE TRIGGER z_guard_proposal_signature_engagement_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_engagement
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_signature_engagement();

-- Client proposal SELECT moved behind a safe bundle RPC in 00390, so the
-- legacy policy's subquery can no longer see its proposals under RLS. Restore
-- only the intended telemetry vocabulary through a narrow definer predicate;
-- signature and workflow event names remain unavailable to browser inserts.
CREATE OR REPLACE FUNCTION public._can_record_proposal_engagement(
  p_proposal_id uuid,
  p_viewer_id uuid,
  p_event_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_viewer_id IS NOT DISTINCT FROM auth.uid()
    AND p_event_type IN ('opened', 'section_viewed', 'downloaded')
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = p_proposal_id
        AND proposal.client_id = auth.uid()
        AND proposal.status <> 'draft'
    )
$$;

REVOKE ALL ON FUNCTION public._can_record_proposal_engagement(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public._can_record_proposal_engagement(
  uuid, uuid, text
) TO authenticated;

DROP POLICY IF EXISTS "Clients can record engagement"
  ON public.proposal_engagement;
CREATE POLICY proposal_engagement_client_telemetry_insert
ON public.proposal_engagement FOR INSERT TO authenticated
WITH CHECK (
  public._can_record_proposal_engagement(
    proposal_id, viewer_id, event_type
  )
);

CREATE OR REPLACE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text,
  p_signed_ip text DEFAULT NULL,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_project_id uuid;
  v_decision_id uuid := gen_random_uuid();
  v_engagement_id uuid := gen_random_uuid();
  v_previous_engagement_token text := current_setting(
    'app.proposal_signature_engagement_id', true
  );
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_proposal.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'proposal % may only be signed by its client', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'id', v_proposal.id,
      'status', v_proposal.status,
      'signed_at', v_proposal.signed_at,
      'accepted_at', v_proposal.accepted_at,
      'project_id', v_proposal.project_id
    );
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not in a signable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'proposal % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_proposal.designer_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM v_proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'proposal % has no exact designer↔client relationship',
      p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.client_decision_insert_id', v_decision_id::text, true);
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, decision_type, blocking_status, status,
    client_consent_method, client_signature, client_consented_at,
    sent_at, responded_at, selected_by
  ) VALUES (
    v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
    v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
    'non_blocking', 'responded', 'electronic_signature', v_signed_name,
    now(), now(), now(), auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
  DO NOTHING;
  PERFORM set_config('app.client_decision_insert_id', '', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decisions AS approval
    WHERE approval.linked_proposal_id = p_proposal_id
      AND approval.decision_type = 'approval'
      AND approval.designer_client_id = v_proposal.designer_client_id
      AND approval.designer_id = v_proposal.designer_id
  ) THEN
    RAISE EXCEPTION 'proposal approval relationship conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = p_signed_ip,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);

  PERFORM set_config(
    'app.proposal_signature_engagement_id', v_engagement_id::text, true
  );
  INSERT INTO public.proposal_engagement (
    id, proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    v_engagement_id, p_proposal_id, auth.uid(), 'signed',
    jsonb_build_object(
      'via', 'sign_proposal',
      'signed_by_name', v_signed_name,
      'signed_ip', p_signed_ip
    )
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    COALESCE(v_previous_engagement_token, ''),
    true
  );

  IF p_auto_activate AND v_proposal.project_id IS NULL THEN
    v_project_id := public._activate_proposal_as_project_authorized(
      p_proposal_id, p_start_date
    );
    v_proposal.project_id := v_project_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'signed_at', v_proposal.signed_at,
    'accepted_at', v_proposal.accepted_at,
    'project_id', v_proposal.project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_offline_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_decision_id uuid := gen_random_uuid();
  v_engagement_id uuid := gen_random_uuid();
  v_previous_engagement_token text := current_setting(
    'app.proposal_signature_engagement_id', true
  );
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_offline_signature requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % may only be recorded by its design studio',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status = 'accepted' THEN
    RETURN v_proposal.project_id;
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed', 'expired') THEN
    RAISE EXCEPTION 'proposal % is not in a recordable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.client_id IS NULL
     OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_proposal.designer_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM v_proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'proposal % has no exact designer↔client relationship',
      p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.client_decision_insert_id', v_decision_id::text, true);
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, decision_type, blocking_status, status,
    client_consent_method, client_signature, client_consented_at,
    sent_at, responded_at, selected_by
  ) VALUES (
    v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
    v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
    'non_blocking', 'responded', 'paper', v_signed_name,
    now(), now(), now(), auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
  DO NOTHING;
  PERFORM set_config('app.client_decision_insert_id', '', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decisions AS approval
    WHERE approval.linked_proposal_id = p_proposal_id
      AND approval.decision_type = 'approval'
      AND approval.designer_client_id = v_proposal.designer_client_id
      AND approval.designer_id = v_proposal.designer_id
  ) THEN
    RAISE EXCEPTION 'proposal approval relationship conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = NULL,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);

  PERFORM set_config(
    'app.proposal_signature_engagement_id', v_engagement_id::text, true
  );
  INSERT INTO public.proposal_engagement (
    id, proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    v_engagement_id, p_proposal_id, auth.uid(), 'signed_offline',
    jsonb_build_object(
      'via', 'record_offline_signature',
      'signed_by_name', v_signed_name,
      'recorded_by', auth.uid()
    )
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    COALESCE(v_previous_engagement_token, ''),
    true
  );

  IF v_proposal.project_id IS NOT NULL THEN
    RETURN v_proposal.project_id;
  ELSIF p_auto_activate THEN
    RETURN public._activate_proposal_as_project_authorized(
      p_proposal_id, p_start_date
    );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_offline_signature(uuid, text, boolean, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_offline_signature(uuid, text, boolean, date)
  TO authenticated;


-- ── Closeout: paid FF&E coverage may be split across invoice lines ─────────

CREATE OR REPLACE FUNCTION public.close_project(
  p_project_id uuid,
  p_closure    jsonb DEFAULT NULL,
  p_snapshot   jsonb DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer           uuid := auth.uid();
  v_project            public.projects;
  v_effective_closure  jsonb;
  v_blocker_count      integer;
  v_collected_cents    bigint;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'close_project requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Parent first. Besides serializing lifecycle acts, FOR UPDATE conflicts
  -- with the FK key-share lock needed by a newly inserted child, so no phase,
  -- decision, amendment, invoice, milestone, or FF&E row can appear after the
  -- locked census begins.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_project.designer_id IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'project % may only be closed by its designer', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_closure := COALESCE(p_closure, v_project.closure_checklist);
  IF v_effective_closure IS NULL
     OR jsonb_typeof(v_effective_closure) <> 'array'
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'walkthrough', 'punch_list', 'payment', 'photography', 'photos',
         'case_study'
       ]) AS required(key)
       WHERE NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_effective_closure) AS item(value)
         WHERE item.value->>'key' = required.key
           AND item.value->'completed' = 'true'::jsonb
       )
     )
  THEN
    RAISE EXCEPTION
      'project closeout checklist must include every required item as completed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00395's client scope-change creator follows project → scope-change order.
  -- Lock every existing row the same way, then reject any request that still
  -- needs a response or an apply_scope_change act.
  PERFORM scope_change.id
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
  ORDER BY scope_change.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
    AND scope_change.applied_at IS NULL
    AND scope_change.status IS DISTINCT FROM 'declined'
    AND scope_change.status IS DISTINCT FROM 'cancelled';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % scope change request(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Responded and expired are the guarded terminal decision states. Draft and
  -- pending rows remain live runtime coordination even when non-blocking. Lock
  -- decisions before phases to match both advance_project_phase and the
  -- completed-phase decision trigger's decision → phase order.
  PERFORM decision.id
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
  ORDER BY decision.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
    AND decision.status IS DISTINCT FROM 'responded'
    AND decision.status IS DISTINCT FROM 'expired';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % coordination/decision item(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- One project-phase state is terminal. Pending, in-progress, and delayed all
  -- represent promised work and must be completed through phase authority.
  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.status IS DISTINCT FROM 'completed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % project phase(s) are not completed',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve 00383/00387's dependency order after the workflow census:
  -- invoice → line → milestone → FF&E.
  PERFORM 1
  FROM public.invoices
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
  WHERE invoice.project_id = p_project_id
  ORDER BY line.id
  FOR UPDATE OF line;

  PERFORM 1
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
    AND status <> 'installed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not installed', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items AS ffe
  WHERE ffe.project_id = p_project_id
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > 0
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > COALESCE((
      SELECT sum(GREATEST(line.amount_cents::bigint, 0::bigint))
      FROM public.invoice_line_items AS line
      JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
      WHERE line.ffe_item_id = ffe.id
        AND invoice.project_id = p_project_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    ), 0::bigint);

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not fully invoiced and paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
    AND amount_cents > 0
    AND status <> 'paid';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % positive payment milestone(s) are not paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invoice headers are advisory until issue_invoice recomputes them. A draft
  -- can therefore carry real positive lines while total_cents is still zero.
  -- Canonical balance truth comes from lines (+ stored tax rate) whenever any
  -- line exists; only genuinely line-less legacy invoices fall back to header.
  SELECT count(*) INTO v_blocker_count
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void'
    AND invoice_truth.canonical_total_cents > invoice_truth.amount_paid_cents;

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % invoice(s) still carry a balance', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(LEAST(
    invoice_truth.canonical_total_cents,
    invoice_truth.amount_paid_cents::bigint
  )), 0)
  INTO v_collected_cents
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void';

  IF COALESCE(v_project.total_amount_cents, 0) > v_collected_cents THEN
    RAISE EXCEPTION
      'project cannot close: contract total is not fully collected'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The trigger accepts this update only while both the definer identity and
  -- this exact row id are present. Clear immediately after the protected act.
  PERFORM set_config('app.project_completion_id', p_project_id::text, true);
  UPDATE public.projects
  SET status             = 'completed',
      closure_checklist  = v_effective_closure,
      portfolio_snapshot = COALESCE(p_snapshot, portfolio_snapshot),
      updated_at         = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_completion_id', '', true);

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.close_project(uuid, jsonb, jsonb) IS
  'Sole project-completion authority. Exact owner only; locks project, scope '
  'changes, decisions, phases, invoices, lines, milestones, and FF&E; rejects '
  'unfinished workflow or operational balances before the guarded transition. '
  'Paid FF&E coverage is summed across split invoice lines. Review outreach is '
  'truthful post-close work, not checklist evidence.';
