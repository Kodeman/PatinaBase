-- ═══════════════════════════════════════════════════════════════════════════
-- 00400 — Proposal signature input and retry authority
--
-- A browser signature previously exposed trusted audit and activation inputs:
-- callers could supply signed_ip, disable project activation, or choose the
-- activated project's start date.  The production route also called that same
-- authenticated RPC, so its Cloudflare-derived IP was indistinguishable from a
-- browser-supplied value.
--
-- This migration replaces that five-argument surface with:
--   · sign_proposal(uuid,text), the minimal authenticated client act; and
--   · sign_proposal_with_trusted_ip(uuid,text,uuid,text), an exact service-role
--     bridge used only after the production route authenticates the client.
--
-- Both wrappers share one private body.  That body owns activation and uses the
-- server's current_date default.  An accepted retry never rewrites signature
-- evidence or duplicates the approval/event; it validates the exact historical
-- consent first, then repairs only a missing reciprocal project link.  Any
-- activation/topology failure rolls the whole signature transaction back.
--
-- Function lineage:
--   sign_proposal: 00210 → 00387 → 00390 → 00399 → 00400
--   activation:    00390 private bridge → 00398 phase-batch/topology bridge
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove the defaulted overload first.  Leaving it installed would let a
-- two-argument PostgREST call resolve to the old caller-controlled parameters.
DROP FUNCTION IF EXISTS public.sign_proposal(uuid, text, text, boolean, date);

CREATE OR REPLACE FUNCTION public._sign_proposal_authorized_00400(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_approval public.client_decisions%ROWTYPE;
  v_project_id uuid;
  v_existing_project_id uuid;
  v_existing_project_client_id uuid;
  v_decision_id uuid := gen_random_uuid();
  v_engagement_id uuid := gen_random_uuid();
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
  v_signed_ip text := NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), '');
  v_newly_signed boolean := false;
  v_previous_decision_insert text := current_setting(
    'app.client_decision_insert_id', true
  );
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_activation text := current_setting(
    'app.proposal_activation_id', true
  );
  v_previous_signature_engagement text := current_setting(
    'app.proposal_signature_engagement_id', true
  );
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'sign_proposal requires an authenticated client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The proposal lock serializes a first signature, a response retry, and an
  -- accepted/no-project repair.  Actor ownership is proved before any accepted
  -- idempotency branch so a service caller cannot turn retry into a read oracle.
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_proposal.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'proposal % may only be signed by its client', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
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

  IF v_proposal.status = 'accepted' THEN
    -- A retry may repair activation, but only from durable consent truth.  It
    -- must never manufacture or replace the signature that accepted the row.
    IF v_proposal.signed_at IS NULL
       OR v_proposal.accepted_at IS NULL
       OR char_length(btrim(COALESCE(v_proposal.signed_by_name, ''))) < 2
    THEN
      RAISE EXCEPTION 'accepted proposal % has incomplete signature evidence',
        p_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not in a signable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  ELSIF v_proposal.valid_until IS NOT NULL
        AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'proposal % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  ELSE
    PERFORM set_config(
      'app.client_decision_insert_id', v_decision_id::text, true
    );
    INSERT INTO public.client_decisions (
      id, designer_client_id, designer_id, project_id, linked_proposal_id,
      title, decision_type, blocking_status, status,
      client_consent_method, client_signature, client_consented_at,
      sent_at, responded_at, selected_by
    ) VALUES (
      v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
      v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
      'non_blocking', 'responded', 'electronic_signature', v_signed_name,
      now(), now(), now(), p_client_id
    )
    ON CONFLICT (linked_proposal_id)
      WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
    DO NOTHING;
    PERFORM set_config(
      'app.client_decision_insert_id',
      COALESCE(v_previous_decision_insert, ''),
      true
    );

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    UPDATE public.proposals
    SET status = 'accepted',
        signed_at = now(),
        signed_by_name = v_signed_name,
        signed_ip = v_signed_ip,
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_proposal_id
    RETURNING * INTO v_proposal;
    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );

    -- 00399 reserves signature evidence rows to the canonical signing paths.
    -- Preallocate the exact row id and expose only that transaction-local
    -- capability while inserting the immutable engagement receipt.
    PERFORM set_config(
      'app.proposal_signature_engagement_id', v_engagement_id::text, true
    );
    INSERT INTO public.proposal_engagement (
      id, proposal_id, viewer_id, event_type, metadata
    ) VALUES (
      v_engagement_id, p_proposal_id, p_client_id, 'signed',
      jsonb_build_object(
        'via', 'sign_proposal',
        'signed_by_name', v_signed_name,
        'signed_ip', v_signed_ip
      )
    );
    PERFORM set_config(
      'app.proposal_signature_engagement_id',
      COALESCE(v_previous_signature_engagement, ''),
      true
    );
    v_newly_signed := true;
  END IF;

  -- Fresh signatures and accepted retries must both prove the exact immutable
  -- approval record.  A forged accepted row cannot be used as activation input.
  SELECT approval.* INTO v_approval
  FROM public.client_decisions AS approval
  WHERE approval.linked_proposal_id = p_proposal_id
    AND approval.decision_type = 'approval'
  FOR UPDATE;

  IF v_approval.id IS NULL
     OR v_approval.designer_client_id
          IS DISTINCT FROM v_proposal.designer_client_id
     OR v_approval.designer_id IS DISTINCT FROM v_proposal.designer_id
     OR v_approval.status IS DISTINCT FROM 'responded'
     OR v_approval.client_signature
          IS DISTINCT FROM v_proposal.signed_by_name
     OR v_approval.client_consented_at IS DISTINCT FROM v_proposal.signed_at
     OR v_approval.responded_at IS DISTINCT FROM v_proposal.accepted_at
     OR v_approval.sent_at IS DISTINCT FROM v_proposal.signed_at
     OR NOT (
       (
         v_approval.client_consent_method
           IS NOT DISTINCT FROM 'electronic_signature'
         AND v_approval.selected_by IS NOT DISTINCT FROM v_proposal.client_id
         AND EXISTS (
           SELECT 1
           FROM public.proposal_engagement AS engagement
           WHERE engagement.proposal_id = p_proposal_id
             AND engagement.event_type = 'signed'
             AND engagement.viewer_id IS NOT DISTINCT FROM v_proposal.client_id
             AND engagement.created_at IS NOT DISTINCT FROM v_proposal.signed_at
             AND engagement.metadata->>'via' = 'sign_proposal'
             AND engagement.metadata->>'signed_by_name'
                   IS NOT DISTINCT FROM v_proposal.signed_by_name
             AND engagement.metadata->>'signed_ip'
                   IS NOT DISTINCT FROM v_proposal.signed_ip
         )
       )
       OR
       (
         v_approval.client_consent_method IS NOT DISTINCT FROM 'paper'
         AND v_approval.selected_by IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.proposal_engagement AS engagement
           WHERE engagement.proposal_id = p_proposal_id
             AND engagement.event_type = 'signed_offline'
             AND engagement.viewer_id IS NOT DISTINCT FROM v_approval.selected_by
             AND engagement.created_at IS NOT DISTINCT FROM v_proposal.signed_at
             AND engagement.metadata->>'via' = 'record_offline_signature'
             AND engagement.metadata->>'signed_by_name'
                   IS NOT DISTINCT FROM v_proposal.signed_by_name
             AND engagement.metadata->>'recorded_by'
                   IS NOT DISTINCT FROM v_approval.selected_by::text
         )
       )
     )
  THEN
    RAISE EXCEPTION 'proposal approval evidence conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    -- This is an idempotent receipt, not a new authority decision. The proposal
    -- and project guards made this reciprocal link write-once, so later mutable
    -- studio state (a departed historical author, paused studio, or suspended
    -- current lead) must not turn a valid accepted retry into a failure.
    PERFORM 1
    FROM public.projects AS project
    WHERE project.id = v_proposal.project_id
      AND project.proposal_id = v_proposal.id
      AND project.client_id IS NOT DISTINCT FROM v_proposal.client_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proposal % has a conflicting project link', p_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_project_id := v_proposal.project_id;
  ELSE
    -- Older p_auto_activate=false signatures can have a durable accepted row
    -- but no proposal.project_id.  Before creating anything, reconcile a single
    -- already-existing reciprocal project left by an interrupted legacy path.
    SELECT project.id, project.client_id
    INTO v_existing_project_id,
         v_existing_project_client_id
    FROM public.projects AS project
    WHERE project.proposal_id = p_proposal_id
    ORDER BY project.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF EXISTS (
        SELECT 1
        FROM public.projects AS duplicate
        WHERE duplicate.proposal_id = p_proposal_id
          AND duplicate.id <> v_existing_project_id
      ) THEN
        RAISE EXCEPTION 'proposal % has multiple project links', p_proposal_id
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_existing_project_client_id IS DISTINCT FROM v_proposal.client_id
         OR NOT EXISTS (
           SELECT 1
           FROM public.projects AS project
           JOIN public.organizations AS studio
             ON studio.id = project.studio_id
            AND studio.type = 'design_studio'
            AND studio.status = 'active'
           JOIN public.organization_members AS historical_author
             ON historical_author.organization_id = studio.id
            AND historical_author.user_id = v_proposal.designer_id
           JOIN public.organization_members AS current_lead
             ON current_lead.organization_id = studio.id
            AND current_lead.user_id = project.designer_id
            AND current_lead.status = 'active'
            AND current_lead.role <> 'guest'
           WHERE project.id = v_existing_project_id
             AND project.proposal_id = v_proposal.id
             AND project.created_by IS NOT DISTINCT FROM v_proposal.designer_id
         )
      THEN
        RAISE EXCEPTION 'proposal % has a conflicting detached project',
          p_proposal_id
          USING ERRCODE = 'check_violation';
      END IF;

      PERFORM set_config(
        'app.proposal_activation_id', p_proposal_id::text, true
      );
      UPDATE public.proposals
      SET project_id = v_existing_project_id
      WHERE id = p_proposal_id;
      PERFORM set_config(
        'app.proposal_activation_id', COALESCE(v_previous_activation, ''), true
      );
      v_project_id := v_existing_project_id;
    ELSE
      -- No client input controls activation or schedule anchoring.  There is no
      -- persisted agreed-start term on proposals at this schema revision, so
      -- the canonical server default is the transaction's current_date.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id,
        current_date
      );
    END IF;
  END IF;

  -- Every path must leave the immutable proposal/project identity reciprocal.
  -- This check intentionally does not revisit mutable studio/member state for
  -- an already-linked receipt; that state can change after a valid acceptance.
  PERFORM 1
  FROM public.projects AS project
  WHERE project.id = v_project_id
    AND project.proposal_id = v_proposal.id
    AND project.client_id IS NOT DISTINCT FROM v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % failed canonical project reciprocity',
      p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fresh activation and detached legacy repair still require live studio
  -- provenance at the moment authority creates or adopts the reciprocal link.
  -- `v_proposal.project_id` is the locked pre-activation value, so NULL
  -- identifies exactly those two paths even after the database write succeeds.
  IF v_proposal.project_id IS NULL THEN
    PERFORM 1
    FROM public.projects AS project
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS historical_author
      ON historical_author.organization_id = studio.id
     AND historical_author.user_id = v_proposal.designer_id
    JOIN public.organization_members AS current_lead
      ON current_lead.organization_id = studio.id
     AND current_lead.user_id = project.designer_id
     AND current_lead.status = 'active'
     AND current_lead.role <> 'guest'
    WHERE project.id = v_project_id
      AND project.created_by IS NOT DISTINCT FROM v_proposal.designer_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'proposal % failed canonical project provenance',
        p_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'signed_at', v_proposal.signed_at,
    'accepted_at', v_proposal.accepted_at,
    'project_id', v_project_id,
    'newly_signed', v_newly_signed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.client_decision_insert_id',
    COALESCE(v_previous_decision_insert, ''),
    true
  );
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.proposal_activation_id', COALESCE(v_previous_activation, ''), true
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    COALESCE(v_previous_signature_engagement, ''),
    true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._sign_proposal_authorized_00400(
  uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id uuid := auth.uid();
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'sign_proposal requires an authenticated client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._sign_proposal_authorized_00400(
    p_proposal_id,
    p_signed_name,
    v_client_id,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.sign_proposal(uuid, text) IS
  'Minimal client signature authority. The authenticated proposal client may '
  'supply only the proposal id and legal name; audit IP, activation, and project '
  'start date are server-owned. Accepted retries preserve evidence and safely '
  'repair a missing reciprocal project.';

CREATE OR REPLACE FUNCTION public.sign_proposal_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sign_proposal_with_trusted_ip requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The service client is used only to carry edge-derived IP evidence and has
  -- no user `sub`. Canonical activation still needs the verified client actor
  -- for schedule-revision provenance. Delegate that exact identity only after
  -- the service-role check; the private core re-checks proposal ownership, and
  -- this transaction-local claim is restored before returning or rethrowing.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_client_id,
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public._sign_proposal_authorized_00400(
    p_proposal_id,
    p_signed_name,
    p_client_id,
    p_signed_ip
  );
  PERFORM set_config('request.jwt.claims', v_previous_claims, true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', v_previous_claims, true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal_with_trusted_ip(
  uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal_with_trusted_ip(
  uuid, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.sign_proposal_with_trusted_ip(
  uuid, text, uuid, text
) IS
  'Service-only signature bridge for the production API route. The route '
  'authenticates p_client_id before passing trusted edge-derived IP evidence; '
  'the shared core re-checks exact proposal ownership and owns activation.';

-- Rollback compatibility for previously deployed web bundles. These exact,
-- non-defaulted overloads accept the old caller-controlled fields but ignore
-- them, delegating to the two-argument authenticated authority. Keeping them
-- non-defaulted avoids ambiguity with the native app's two-argument call.
CREATE OR REPLACE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text,
  p_signed_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._sign_proposal_authorized_00400(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text,
  p_signed_ip text,
  p_auto_activate boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_auto_activate IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'proposal activation is mandatory after signature'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._sign_proposal_authorized_00400(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text, text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text, text, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.sign_proposal(uuid, text, text) IS
  'Temporary rollback wrapper; ignores caller-supplied IP and delegates to '
  'the canonical authenticated signature authority.';
COMMENT ON FUNCTION public.sign_proposal(uuid, text, text, boolean) IS
  'Temporary rollback wrapper; ignores caller-supplied IP, requires mandatory '
  'activation, and delegates to the canonical authenticated authority.';
