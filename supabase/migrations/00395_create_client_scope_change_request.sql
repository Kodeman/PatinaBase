-- ═══════════════════════════════════════════════════════════════════════════
-- 00395 — Scope-change request authority and retry integrity
--
-- Function-body lineage: apply_scope_change 00084 → 00253 → 00395
--
-- Client capture previously had no RLS-safe insert path and no retry identity.
-- A lost response could therefore tempt a second request/activity pair. The
-- caller now supplies a UUID intent key which is also the request primary key:
-- an identical retry returns the original receipt and never emits a second
-- client_activity_log row; reusing the key for different input fails closed.
--
-- The original UPDATE policies also allowed authenticated callers to rewrite
-- identity/business columns while changing a permitted status. Business input
-- is now immutable after INSERT, table UPDATE is removed from browser roles,
-- and every workflow transition runs through a checked SECURITY DEFINER RPC.
-- apply_scope_change keeps the 00253 materialization body, adds exact active
-- design-studio authority, and serializes application so the project can only
-- be charged once. Direct designer/studio INSERT and SELECT flows remain.
-- ═══════════════════════════════════════════════════════════════════════════

-- Validate a stored requester independently of the current JWT actor. This is
-- used when the project client responds to a designer-authored amendment: the
-- requester must be the owner or an active, non-guest peer in the same active
-- design_studio, never merely a contractor/manufacturer co-member.
CREATE OR REPLACE FUNCTION public._scope_change_requester_can_author(
  p_actor uuid,
  p_owner uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_actor IS NOT NULL AND p_owner IS NOT NULL AND (
    p_actor = p_owner
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      JOIN public.organization_members AS owner_membership
        ON owner_membership.organization_id = actor_membership.organization_id
      JOIN public.organizations AS organization
        ON organization.id = actor_membership.organization_id
      WHERE actor_membership.user_id = p_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND owner_membership.user_id = p_owner
        AND owner_membership.status = 'active'
        AND owner_membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
    )
  );
$$;

REVOKE ALL ON FUNCTION public._scope_change_requester_can_author(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- A local transition marker alone is not an authority: any database caller can
-- set a custom GUC. The UPDATE guard also requires the update to execute as the
-- table owner (the SECURITY DEFINER owner), so authenticated SQL cannot forge
-- the marker. Each marker is then constrained to its exact legal column delta.
CREATE OR REPLACE FUNCTION public.guard_scope_change_request_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authority_token text := current_setting('app.scope_change_transition', true);
  v_transition text;
  v_table_owner name;
  v_project_designer uuid;
BEGIN
  SELECT pg_get_userbyid(relation.relowner)
  INTO v_table_owner
  FROM pg_class AS relation
  WHERE relation.oid = TG_RELID;

  IF TG_OP = 'INSERT' THEN
    -- Browser-created designer/studio drafts must identify their real author.
    -- Client-created rows execute as the checked definer RPC and set this too.
    IF current_user IS DISTINCT FROM v_table_owner
       AND auth.uid() IS NOT NULL
       AND NEW.requested_by IS DISTINCT FROM auth.uid()
    THEN
      RAISE EXCEPTION 'scope_change_request_requested_by_must_match_actor'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Only the project designer or an exact active design-studio peer may use
    -- the retained browser draft INSERT path. Project clients submit through
    -- create_client_scope_change_request so retry identity and activity are
    -- always atomic with the sent request.
    IF current_user IS DISTINCT FROM v_table_owner
       AND auth.uid() IS NOT NULL
    THEN
      SELECT project.designer_id
      INTO v_project_designer
      FROM public.projects AS project
      WHERE project.id = NEW.project_id;

      IF v_project_designer IS NULL
         OR NOT (
           v_project_designer = auth.uid()
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
               AND owner_membership.user_id = v_project_designer
               AND owner_membership.status = 'active'
               AND owner_membership.role <> 'guest'
               AND organization.type = 'design_studio'
               AND organization.status = 'active'
           )
         )
      THEN
        RAISE EXCEPTION 'scope_change_request_direct_insert_requires_project_studio'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Only a checked owner-executed authority may create lifecycle evidence.
    -- Direct designer/studio/service writes remain useful for composing drafts,
    -- but cannot fabricate something sent, signed, resolved, or applied.
    IF current_user IS DISTINCT FROM v_table_owner
       AND (
         NEW.status <> 'draft'
         OR NEW.sent_at IS NOT NULL
         OR NEW.viewed_at IS NOT NULL
         OR NEW.approved_at IS NOT NULL
         OR NEW.approved_by IS NOT NULL
         OR NEW.approved_by_name IS NOT NULL
         OR NEW.approved_ip IS NOT NULL
         OR NEW.declined_at IS NOT NULL
         OR NEW.decline_reason IS NOT NULL
         OR NEW.applied_at IS NOT NULL
         OR NEW.signed_pdf_url IS NOT NULL
         OR NEW.signature_metadata IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'scope_change_request_direct_inserts_must_be_clean_drafts'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Scope identity and commercial content are append-only evidence. A new
  -- intent is a new row; even a checked status authority cannot rewrite it.
  IF ROW(
    NEW.id,
    NEW.project_id,
    NEW.proposal_id,
    NEW.requested_by,
    NEW.title,
    NEW.description,
    NEW.additional_ffe_budget_cents,
    NEW.additional_design_fee_cents,
    NEW.timeline_impact_weeks,
    NEW.new_total_budget_cents,
    NEW.new_rooms,
    NEW.new_ffe_items,
    NEW.co_number,
    NEW.original_spec,
    NEW.requested_change,
    NEW.affected_tasks,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.project_id,
    OLD.proposal_id,
    OLD.requested_by,
    OLD.title,
    OLD.description,
    OLD.additional_ffe_budget_cents,
    OLD.additional_design_fee_cents,
    OLD.timeline_impact_weeks,
    OLD.new_total_budget_cents,
    OLD.new_rooms,
    OLD.new_ffe_items,
    OLD.co_number,
    OLD.original_spec,
    OLD.requested_change,
    OLD.affected_tasks,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'scope_change_request_business_fields_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- updated_at is maintained by the pre-existing set_updated_at trigger and is
  -- intentionally absent. If no workflow field moved, there is nothing else
  -- for this guard to authorize.
  IF ROW(
    NEW.status,
    NEW.sent_at,
    NEW.viewed_at,
    NEW.approved_at,
    NEW.approved_by,
    NEW.approved_by_name,
    NEW.approved_ip,
    NEW.declined_at,
    NEW.decline_reason,
    NEW.applied_at,
    NEW.signed_pdf_url,
    NEW.signature_metadata
  ) IS NOT DISTINCT FROM ROW(
    OLD.status,
    OLD.sent_at,
    OLD.viewed_at,
    OLD.approved_at,
    OLD.approved_by,
    OLD.approved_by_name,
    OLD.approved_ip,
    OLD.declined_at,
    OLD.decline_reason,
    OLD.applied_at,
    OLD.signed_pdf_url,
    OLD.signature_metadata
  ) THEN
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM v_table_owner THEN
    RAISE EXCEPTION 'scope_change_request_transition_requires_checked_authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Scope the marker to one transition, one request row, and this transaction.
  -- Even owner-executed nested code cannot reuse an authority on a sibling row.
  IF v_authority_token = format(
    'send:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'send';
  ELSIF v_authority_token = format(
    'view:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'view';
  ELSIF v_authority_token = format(
    'approve:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'approve';
  ELSIF v_authority_token = format(
    'decline:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'decline';
  ELSIF v_authority_token = format(
    'cancel:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'cancel';
  ELSIF v_authority_token = format(
    'apply:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'apply';
  ELSE
    RAISE EXCEPTION 'scope_change_request_transition_requires_row_scoped_authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  CASE v_transition
    WHEN 'send' THEN
      IF NOT (
        OLD.status = 'draft'
        AND NEW.status = 'sent'
        AND NEW.sent_at IS NOT NULL
        AND ROW(
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_send_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'view' THEN
      IF NOT (
        OLD.status = 'sent'
        AND NEW.status = 'viewed'
        AND NEW.viewed_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_view_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'approve' THEN
      IF NOT (
        OLD.status IN ('sent', 'viewed')
        AND NEW.status = 'approved'
        AND NEW.approved_at IS NOT NULL
        AND NEW.approved_by = auth.uid()
        AND btrim(COALESCE(NEW.approved_by_name, '')) <> ''
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_approve_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'decline' THEN
      IF NOT (
        OLD.status IN ('sent', 'viewed')
        AND NEW.status = 'declined'
        AND NEW.declined_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_decline_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'cancel' THEN
      IF NOT (
        OLD.status IN ('draft', 'sent', 'viewed')
        AND NEW.status = 'cancelled'
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_cancel_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'apply' THEN
      IF NOT (
        OLD.status = 'approved'
        AND NEW.status = 'approved'
        AND OLD.applied_at IS NULL
        AND NEW.applied_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_apply_transition'
          USING ERRCODE = 'check_violation';
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_scope_change_request_integrity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_scope_change_request_integrity
  ON public.scope_change_requests;
CREATE TRIGGER guard_scope_change_request_integrity
  BEFORE INSERT OR UPDATE ON public.scope_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_scope_change_request_integrity();

-- Browser roles may create designer/studio drafts and read rows allowed by RLS,
-- but all updates are RPC-only. Explicit grants preserve fresh-stack behavior.
GRANT SELECT, INSERT ON TABLE public.scope_change_requests TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.scope_change_requests
  FROM anon, authenticated, service_role;

-- Remove the earlier draft signature if this unshipped migration was replayed
-- in a development database before the UUID retry key was added.
DROP FUNCTION IF EXISTS public.create_client_scope_change_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.create_client_scope_change_request(
  p_project_id uuid,
  p_idempotency_key uuid,
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
  v_inserted boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'create_client_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION
      'create_client_scope_change_request: idempotency_key_required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_title = '' OR v_description = '' THEN
    RAISE EXCEPTION
      'create_client_scope_change_request: title and description are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A retry is resolved before the project-state check. If the original call
  -- committed and the project subsequently closed, the caller still receives
  -- the exact original receipt instead of a false failure or duplicate row.
  SELECT *
  INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_idempotency_key;

  IF FOUND THEN
    IF v_request.project_id IS DISTINCT FROM p_project_id
       OR v_request.requested_by IS DISTINCT FROM v_actor
       OR v_request.title IS DISTINCT FROM v_title
       OR v_request.description IS DISTINCT FROM v_description
       OR v_request.sent_at IS NULL
       OR v_request.status NOT IN ('sent', 'viewed', 'approved', 'declined', 'cancelled')
    THEN
      RAISE EXCEPTION
        'create_client_scope_change_request: idempotency_conflict'
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN jsonb_build_object(
      'id', v_request.id,
      'project_id', v_request.project_id,
      'status', 'sent',
      'sent_at', v_request.sent_at
    );
  END IF;

  -- Project-first lock order matches close_project (00394). Once this check
  -- passes, closeout cannot complete before the request INSERT commits.
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
    id,
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
    p_idempotency_key,
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
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_request;

  v_inserted := FOUND;

  -- A concurrent call with the same key waits on the PK and lands here. It is
  -- a retry only when every intent field matches the committed request.
  IF NOT v_inserted THEN
    SELECT *
    INTO v_request
    FROM public.scope_change_requests
    WHERE id = p_idempotency_key;

    IF NOT FOUND
       OR v_request.project_id IS DISTINCT FROM p_project_id
       OR v_request.requested_by IS DISTINCT FROM v_actor
       OR v_request.title IS DISTINCT FROM v_title
       OR v_request.description IS DISTINCT FROM v_description
       OR v_request.sent_at IS NULL
       OR v_request.status NOT IN ('sent', 'viewed', 'approved', 'declined', 'cancelled')
    THEN
      RAISE EXCEPTION
        'create_client_scope_change_request: idempotency_conflict'
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN jsonb_build_object(
      'id', v_request.id,
      'project_id', v_request.project_id,
      'status', 'sent',
      'sent_at', v_request.sent_at
    );
  END IF;

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
    'status', 'sent',
    'sent_at', v_request.sent_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_scope_change_request(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_scope_change_request(uuid, uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_client_scope_change_request(uuid, uuid, text, text) IS
  '00395: authenticated client-only, project-locked and UUID-idempotent scope-change capture. '
  'An identical retry returns the original narrow receipt and emits no second activity.';

CREATE OR REPLACE FUNCTION public.send_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'send_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'send_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'send_scope_change_request: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.status <> 'draft'
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by,
       v_project.designer_id
     )
  THEN
    RAISE EXCEPTION 'send_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('send:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET status = 'sent',
      sent_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config('app.scope_change_transition', '', true);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status,
    'sent_at', v_request.sent_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_scope_change_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_scope_change_request(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_scope_change_request(
  p_request_id uuid,
  p_project_id uuid,
  p_approved_by_name text,
  p_approved_ip text DEFAULT NULL
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
  v_approved_by_name text := btrim(COALESCE(p_approved_by_name, ''));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'approve_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_approved_by_name = '' THEN
    RAISE EXCEPTION 'approve_scope_change_request: signer name required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_project.client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'approve_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.requested_by IS NOT DISTINCT FROM v_actor
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by,
       v_project.designer_id
     )
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION 'approve_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('approve:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET status = 'approved',
      approved_at = now(),
      approved_by = v_actor,
      approved_by_name = v_approved_by_name,
      approved_ip = NULLIF(btrim(COALESCE(p_approved_ip, '')), '')
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config('app.scope_change_transition', '', true);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status,
    'approved_at', v_request.approved_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_scope_change_request(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_scope_change_request(uuid, uuid, text, text)
  TO authenticated, service_role;

-- Client-origin requests are not client-signature documents. An exact design
-- studio author accepts the inbound request; it then uses the same atomic Apply
-- act as any approved amendment to mark the requested work fulfilled.
CREATE OR REPLACE FUNCTION public.accept_client_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'accept_client_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'accept_client_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'accept_client_scope_change_request: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_project.client_id IS NULL
     OR v_request.requested_by IS DISTINCT FROM v_project.client_id
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION 'accept_client_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.full_name), ''), 'Designer')
  INTO v_actor_name
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Designer');

  PERFORM set_config(
    'app.scope_change_transition',
    format('approve:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET status = 'approved',
      approved_at = now(),
      approved_by = v_actor,
      approved_by_name = v_actor_name,
      approved_ip = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config('app.scope_change_transition', '', true);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status,
    'approved_at', v_request.approved_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_client_scope_change_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_client_scope_change_request(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_client_scope_change_request(uuid, uuid) IS
  '00395: exact active design-studio authority accepts a sent/viewed request authored by the project client. The approved request then resolves through apply_scope_change.';

CREATE OR REPLACE FUNCTION public.decline_scope_change_request(
  p_request_id uuid,
  p_project_id uuid,
  p_decline_reason text DEFAULT NULL
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'decline_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_project.client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'decline_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.requested_by IS NOT DISTINCT FROM v_actor
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by,
       v_project.designer_id
     )
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION 'decline_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('decline:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET status = 'declined',
      declined_at = now(),
      decline_reason = NULLIF(btrim(COALESCE(p_decline_reason, '')), '')
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config('app.scope_change_transition', '', true);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status,
    'declined_at', v_request.declined_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_scope_change_request(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_scope_change_request(uuid, uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'cancel_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.requested_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'cancel_scope_change_request: request not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    v_project.client_id IS NOT DISTINCT FROM v_actor
    OR public._can_author_proposal(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'cancel_scope_change_request: access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status NOT IN ('draft', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'cancel_scope_change_request: invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('cancel:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET status = 'cancelled'
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config('app.scope_change_transition', '', true);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'project_id', v_request.project_id,
    'status', v_request.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scope_change_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_scope_change_request(uuid, uuid)
  TO authenticated, service_role;

-- 00253's materialization body is retained. Authority is restricted to the
-- exact active design studio; project-first locking makes apply/close atomic.
CREATE OR REPLACE FUNCTION public.apply_scope_change(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.scope_change_requests%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_project_id uuid;
  v_new_room jsonb;
  v_new_item jsonb;
  v_new_room_id uuid;
  v_room_ids_by_name jsonb := '{}'::jsonb;
  v_project_room_id uuid;
  v_quantity integer;
  v_unit_price_cents integer;
  v_line_total_cents integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'apply_scope_change requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT request.project_id INTO v_project_id
  FROM public.scope_change_requests AS request
  WHERE request.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = v_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'Not authorized to apply scope change % for this project', p_request_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'apply_scope_change: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = v_project.id
    AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  IF v_request.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Scope change % already applied at %', p_request_id, v_request.applied_at;
  END IF;

  IF NOT (
    v_request.requested_by IS NOT DISTINCT FROM v_project.client_id
    OR public._scope_change_requester_can_author(
      v_request.requested_by,
      v_project.designer_id
    )
  ) THEN
    RAISE EXCEPTION 'Scope change request % has an invalid requester', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Add new rooms. Canonical stored amendments use snake_case; the former
  -- browser apply path accepted camelCase. Normalize both without rewriting the
  -- immutable request evidence, and remember each generated room ID by name.
  FOR v_new_room IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_rooms, '[]'::jsonb))
  LOOP
    INSERT INTO public.project_rooms (
      project_id,
      name,
      room_type,
      dimensions,
      floor_area_sqft,
      budget_cents,
      ffe_categories,
      notes
    ) VALUES (
      v_request.project_id,
      v_new_room->>'name',
      COALESCE(v_new_room->>'room_type', v_new_room->>'roomType'),
      v_new_room->>'dimensions',
      NULLIF(
        COALESCE(v_new_room->>'floor_area_sqft', v_new_room->>'floorAreaSqft'),
        ''
      )::numeric(10,2),
      COALESCE(
        NULLIF(
          COALESCE(v_new_room->>'budget_cents', v_new_room->>'budgetCents'),
          ''
        )::integer,
        0
      ),
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(
            v_new_room->'ffe_categories',
            v_new_room->'ffeCategories',
            '[]'::jsonb
          )
        )
      ),
      v_new_room->>'notes'
    )
    RETURNING id INTO v_new_room_id;

    IF NULLIF(v_new_room->>'name', '') IS NOT NULL THEN
      v_room_ids_by_name := v_room_ids_by_name || jsonb_build_object(
        v_new_room->>'name',
        v_new_room_id::text
      );
    END IF;
  END LOOP;

  -- 2. Add new FF&E items. Besides accepting both key conventions, preserve
  -- the removed browser path's roomName → newly inserted room ID behavior.
  FOR v_new_item IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_ffe_items, '[]'::jsonb))
  LOOP
    v_project_room_id := COALESCE(
      NULLIF(v_new_item->>'project_room_id', '')::uuid,
      NULLIF(v_new_item->>'projectRoomId', '')::uuid,
      NULLIF(
        v_room_ids_by_name->>COALESCE(
          NULLIF(v_new_item->>'roomName', ''),
          NULLIF(v_new_item->>'room_name', '')
        ),
        ''
      )::uuid
    );
    v_quantity := COALESCE(
      NULLIF(COALESCE(v_new_item->>'quantity', ''), '')::integer,
      1
    );
    v_unit_price_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'unit_price_cents', v_new_item->>'unitPriceCents'),
        ''
      )::integer,
      0
    );
    v_line_total_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'line_total_cents', v_new_item->>'lineTotalCents'),
        ''
      )::integer,
      v_unit_price_cents * v_quantity
    );

    INSERT INTO public.project_ffe_items (
      project_id,
      project_room_id,
      name,
      ffe_category,
      item_type,
      quantity,
      unit_price_cents,
      line_total_cents,
      vendor_name,
      notes
    ) VALUES (
      v_request.project_id,
      v_project_room_id,
      v_new_item->>'name',
      COALESCE(v_new_item->>'ffe_category', v_new_item->>'ffeCategory'),
      COALESCE(
        v_new_item->>'item_type',
        v_new_item->>'itemType',
        CASE
          WHEN v_new_item ?| ARRAY[
            'roomName', 'ffeCategory', 'itemType', 'unitPriceCents'
          ] THEN 'tbd'
          ELSE 'fixed'
        END
      ),
      v_quantity,
      v_unit_price_cents,
      v_line_total_cents,
      COALESCE(v_new_item->>'vendor_name', v_new_item->>'vendorName'),
      v_new_item->>'notes'
    );
  END LOOP;

  -- 3. Update project totals (body retained from 00253/00084).
  UPDATE public.projects
  SET budget_cents = budget_cents
        + COALESCE(v_request.additional_ffe_budget_cents, 0),
      design_fee_cents = design_fee_cents
        + COALESCE(v_request.additional_design_fee_cents, 0),
      target_end_date = target_end_date
        + (COALESCE(v_request.timeline_impact_weeks, 0) * 7),
      updated_at = now()
  WHERE id = v_request.project_id;

  -- 4. Mark request applied through the checked transition marker.
  PERFORM set_config(
    'app.scope_change_transition',
    format('apply:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET applied_at = now()
  WHERE id = p_request_id;
  PERFORM set_config('app.scope_change_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_scope_change(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_change(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_scope_change(uuid) IS
  '00395 (lineage 00084→00253): atomically materializes one approved scope change. '
  'Caller must own or share the project studio; project/request locks prevent double apply.';
