-- ═══════════════════════════════════════════════════════════════════════════
-- 00903 — Round 8 acceptance: C6 audience = contributing signers (K9);
-- a returned request's unchanged evidence cannot be re-requested (K11).
-- US-52 RC-8 FIX7. Ships INACTIVE: no capability, grant or ACL changes.
--
-- K9 (RC7-E1-1). get_studio_service_completion 00888 -> 00895 -> 00903.
--   00895 body copied verbatim; the only delta is a row filter on the client
--   projection. A completion is listed only to the project client or to an
--   active signer of the request that contributed it (c.acceptance_request_id),
--   by profile or by the profile its household card links to now (the 00894
--   identity rule). Before, any active signer of ANY sent request on the
--   project read every completion. The entry gate (project client, or active
--   signer on any sent request) is unchanged on purpose: before a completion
--   exists there is no contributing request, and a gate keyed to one would
--   refuse current signers with 42501, which iOS treats as a failed read. A
--   gated-in caller with no contributing slot now reads completions = [].
--   The studio branch, projected fields, ordering and signature are unchanged.
--
-- K11 (RC7-E2-OBS-2). create_service_acceptance_request
--   00886 -> 00889 -> 00890 -> 00891 -> 00903. 00891 body copied verbatim; the
--   only delta refuses a new request whose evidence equals that of a
--   closed/returned request on the same project:
--   RAISE 'acceptance_rerequest_needs_new_evidence' USING ERRCODE 'PT409'
--   (HTTP 409; deterministic, so never 40001, which PostgREST retries forever).
--   Comparison: the request's frozen evidence_manifest_hash, not the manifest id.
--   A request freezes evidence_manifest_hash = evidence_manifests.manifest_hash,
--   the sha256 of the canonical resolved member list (00877). Manifests are
--   content-addressed (UNIQUE project, package, purpose, manifest_hash), so the
--   same members always give the same hash; comparing the hash also catches an
--   identical member set minted under another package id, which an id
--   comparison would miss. The send-time snapshot is not the comparison: K11
--   rejected "a fresh send-time freeze counts as new evidence".
--   Scope: any returned request on the project, whatever its scope edition;
--   withdrawn, superseded and accepted requests are not consulted. An exact
--   replay of a receipt still returns first (R15). The check runs after the
--   latest request's FOR UPDATE and adds no lock, so lock order stays
--   project -> (edition FOR SHARE) -> request.
--
-- Both functions keep their ACLs through CREATE OR REPLACE, so this file has
-- no GRANT/REVOKE and seed/00-legacy-grants.sql is unchanged. Nothing is on
-- Strata; no backfill.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_studio_service_completion(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_studio boolean;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_studio := public.can_compose_project_plan(p_project_id);
  IF v_studio THEN
    RETURN jsonb_build_object('projectId', p_project_id, 'audience', 'studio',
      'capability', CASE WHEN COALESCE((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), false)
        THEN 'active' ELSE 'inactive' END,
      'completions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'completionId', c.id, 'scopeEditionId', c.scope_edition_id, 'acceptanceRequestId', c.acceptance_request_id,
          'state', c.state, 'openConditionIds', to_jsonb(c.open_condition_ids), 'obligationSnapshot', c.obligation_snapshot,
          'obligationHash', c.obligation_hash, 'financialHold', c.financial_hold, 'completedBy', c.completed_by,
          'completedAt', c.completed_at, 'conditionsClosedAt', c.conditions_closed_at, 'revokedAt', c.revoked_at,
          'revokedBy', c.revoked_by, 'revokeReason', c.revoke_reason) ORDER BY c.completed_at DESC, c.id)
        FROM public.studio_service_completions c WHERE c.project_id = p_project_id), '[]'::jsonb),
      'resolutions', COALESCE((SELECT jsonb_agg(jsonb_build_object('resolutionId', r.id, 'requestId', r.request_id,
          'conditionId', r.condition_id, 'responseId', r.response_id, 'resolution', r.resolution, 'evidence', r.evidence,
          'resolvedBy', r.resolved_by, 'resolvedAt', r.resolved_at) ORDER BY r.resolved_at, r.id)
        FROM public.service_acceptance_condition_resolutions r
        JOIN public.service_acceptance_requests q ON q.id = r.request_id WHERE q.project_id = p_project_id), '[]'::jsonb));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND client_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.service_acceptance_signers s
       JOIN public.service_acceptance_requests q ON q.id = s.request_id
       WHERE q.project_id = p_project_id AND q.sent_at IS NOT NULL AND s.status = 'active'
         AND (s.profile_id = v_uid OR EXISTS (SELECT 1 FROM public.studio_contacts sc
           WHERE sc.id = s.household_person_id AND sc.profile_id = v_uid))) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId', p_project_id, 'audience', 'client',
    'completions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'completionId', c.id, 'state', c.state, 'completedAt', c.completed_at,
        'conditionsClosedAt', c.conditions_closed_at, 'scopeEditionId', c.scope_edition_id,
        'scopeContentHash', q.scope_content_hash, 'acceptanceRequestId', c.acceptance_request_id,
        'requestNumber', q.request_number) ORDER BY c.completed_at DESC, c.id)
      FROM public.studio_service_completions c JOIN public.service_acceptance_requests q ON q.id = c.acceptance_request_id
      WHERE c.project_id = p_project_id AND c.revoked_at IS NULL
        -- 00903 delta (K9, RC7-E1-1): only the project client, or an active
        -- signer of the contributing request (profile, or the profile its
        -- household card links to now), sees a completion.
        AND (EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND client_id = v_uid)
          OR EXISTS (SELECT 1 FROM public.service_acceptance_signers s
            WHERE s.request_id = c.acceptance_request_id AND s.status = 'active'
              AND (s.profile_id = v_uid OR EXISTS (SELECT 1 FROM public.studio_contacts sc
                WHERE sc.id = s.household_person_id AND sc.profile_id = v_uid))))), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service_acceptance_request(
  p_project_id uuid, p_scope_edition_id uuid, p_evidence_manifest_id uuid, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_project public.projects%ROWTYPE;
  v_edition public.project_scope_editions%ROWTYPE; v_manifest public.evidence_manifests%ROWTYPE;
  v_existing public.service_acceptance_requests%ROWTYPE; v_prior public.service_acceptance_requests%ROWTYPE;
  v_signers jsonb; v_studio uuid; v_draft uuid; v_number integer; v_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_uid IS NULL OR v_project.id IS NULL OR NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_edition FROM public.project_scope_editions
  WHERE id = p_scope_edition_id AND project_id = p_project_id FOR SHARE;
  v_hash := public._service_acceptance_hash(jsonb_build_object('projectId', p_project_id,
    'scopeEditionId', p_scope_edition_id, 'evidenceManifestId', p_evidence_manifest_id));
  SELECT * INTO v_existing FROM public.service_acceptance_requests
  WHERE project_id = p_project_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_hash <> v_hash OR v_existing.created_by <> v_uid THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_acceptance_create_receipt(v_existing.id, true);
  END IF;
  IF v_edition.id IS NULL OR v_edition.status <> 'active' THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_manifest FROM public.evidence_manifests WHERE id = p_evidence_manifest_id;
  IF v_manifest.id IS NULL OR v_manifest.project_id <> p_project_id OR v_manifest.purpose <> 'service_acceptance' THEN
    RAISE EXCEPTION 'evidence_manifest_invalid' USING ERRCODE = 'check_violation';
  END IF;
  -- 00889 delta (SQ-2275): every member must have a client projection in
  -- get_my_service_acceptance_evidence (A20), so a signer is never asked to
  -- accept what they cannot read. po_spec_snapshot and coordination_item_revision
  -- (and any later kind) are refused before anything is written.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_manifest.members) e WHERE (e->>'kind') IS NULL OR e->>'kind' NOT IN
      ('plan_issue', 'plan_issue_print', 'plan_print', 'product_configuration', 'custom_commission_revision',
       'review_item', 'approval_artifact')) THEN
    RAISE EXCEPTION 'service_acceptance_evidence_not_client_readable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
      'householdPersonId', s.household_person_id) ORDER BY s.slot), '[]'::jsonb) INTO v_signers
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  IF jsonb_typeof(v_edition.content->'signerPolicy') IS DISTINCT FROM 'object' OR jsonb_array_length(v_signers) = 0 THEN
    RAISE EXCEPTION 'signer_policy_missing' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._validate_service_acceptance_signers(v_edition.source_proposal_id, v_signers);
  v_studio := public.project_recorded_studio(p_project_id);
  IF v_studio IS NULL OR v_project.client_id IS NULL THEN
    RAISE EXCEPTION 'service_acceptance_recipient_missing' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_prior FROM public.service_acceptance_requests WHERE project_id = p_project_id
  ORDER BY request_number DESC LIMIT 1 FOR UPDATE;
  -- 00903 delta (K11, RC7-E2-OBS-2): a re-request needs new evidence. Refuse
  -- a request whose evidence manifest hash equals that of any closed/returned
  -- request on this project. Checked after the latest request's FOR UPDATE, so
  -- a return that closes it concurrently is either committed and seen here, or
  -- waits and then meets the supersede below. Takes no new lock.
  IF EXISTS (SELECT 1 FROM public.service_acceptance_requests r
      WHERE r.project_id = p_project_id AND r.lifecycle = 'closed' AND r.closed_reason = 'returned'
        AND r.evidence_manifest_hash = v_manifest.manifest_hash) THEN
    RAISE EXCEPTION 'acceptance_rerequest_needs_new_evidence' USING ERRCODE = 'PT409';
  END IF;
  IF v_prior.lifecycle IN ('draft','sent') THEN
    PERFORM public._supersede_service_acceptance_request(v_prior.id, 'successor_request');
  END IF;
  v_number := COALESCE(v_prior.request_number, 0) + 1;
  -- 00891 delta (SQ-2328): one V22 draft per required signer, addressed to that
  -- signer (NULL address, the Ready-to-send hold, when their profile has no
  -- email). The request records the first signer's draft.
  WITH composed AS (
    INSERT INTO public.outbound_drafts (organization_id, project_id, kind, channel, recipient_kind,
      to_contact_id, to_client_id, to_party_id, to_address, subject, body, payload, ref_type, ref_id, dedupe_key,
      due_at, expires_at, composed_by)
    SELECT v_studio, p_project_id, 'service_acceptance_request', 'email', 'client',
      s.household_person_id, COALESCE(s.profile_id, sc.profile_id), NULL, NULLIF(btrim(p.email), ''),
      'Review the agreed services',
      'Your studio has prepared the agreed services for your review. Open your project to accept them, '
        || 'accept them with conditions, or return them with a note.',
      jsonb_build_object('requestId', v_id, 'projectId', p_project_id, 'requestNumber', v_number,
        'scopeEditionId', v_edition.id),
      'service_acceptance_request', v_id, 'service_acceptance_request:' || v_id || ':' || s.slot, NULL, NULL,
      v_uid::text
    FROM public.project_scope_edition_signers s
    LEFT JOIN public.studio_contacts sc ON sc.id = s.household_person_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(s.profile_id, sc.profile_id)
    WHERE s.edition_id = v_edition.id AND s.required
    RETURNING id, dedupe_key
  )
  SELECT id INTO v_draft FROM composed ORDER BY dedupe_key LIMIT 1;
  PERFORM set_config('app.service_acceptance_request_id', v_id::text, true);
  INSERT INTO public.service_acceptance_requests(id, project_id, scope_edition_id, scope_content_hash,
    evidence_manifest_id, evidence_manifest_hash, request_number, predecessor_request_id, outbound_draft_id,
    client_request_id, request_hash, created_by)
  VALUES (v_id, p_project_id, v_edition.id, v_edition.content_hash, v_manifest.id, v_manifest.manifest_hash,
    v_number, v_prior.id, v_draft, v_key, v_hash, v_uid);
  INSERT INTO public.service_acceptance_signers(request_id, slot, required, profile_id, household_person_id, policy_slot)
  SELECT v_id, s.slot, s.required, s.profile_id, s.household_person_id, s.slot
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  PERFORM public._derive_service_acceptance_outcome(v_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_acceptance_create_receipt(v_id, false);
END;
$$;
