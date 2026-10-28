-- ═══════════════════════════════════════════════════════════════════════════
-- 00890 — Round 8 C4 service-acceptance draft carries the client's address
-- (US-52 W6 RC-2 repair, SQ-2324; defect found by RC-2 SQ-2235). Ships INACTIVE.
--
-- Lineage: create_service_acceptance_request 00886 → 00889 → 00890. The body is
-- copied verbatim from 00889 (the latest CREATE OR REPLACE; no later file
-- redefines it) with one delta: the project client's email is read from
-- public.profiles.email (trimmed, empty treated as NULL) and passed to
-- compose_outbound_draft as 'address' next to 'client_id'.
--
-- Reconciles: compose_outbound_draft (00783) writes to_address only from
-- p_to->>'address', so every service-acceptance draft landed with
-- to_address IS NULL and the designer's Ready-to-send sheet held Send with "no
-- address on file". No request could be sent, so A20–A23/X08 were unreachable.
-- Other client-draft callers already pass the address (invoice-reminders).
--
-- A client with no email keeps to_address NULL: the existing V22 hold is the
-- correct outcome and no recipient is invented. No backfill (nothing is on
-- Strata). Signature, SECURITY DEFINER, search_path and ACL are unchanged:
-- CREATE OR REPLACE keeps 00886's ACL (inactive until the C4 activation step),
-- so this file has no GRANT/REVOKE and seed/00-legacy-grants.sql is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_service_acceptance_request(
  p_project_id uuid, p_scope_edition_id uuid, p_evidence_manifest_id uuid, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_project public.projects%ROWTYPE;
  v_edition public.project_scope_editions%ROWTYPE; v_manifest public.evidence_manifests%ROWTYPE;
  v_existing public.service_acceptance_requests%ROWTYPE; v_prior public.service_acceptance_requests%ROWTYPE;
  v_signers jsonb; v_studio uuid; v_draft uuid; v_number integer; v_id uuid := extensions.gen_random_uuid();
  v_address text;
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
  IF v_prior.lifecycle IN ('draft','sent') THEN
    PERFORM public._supersede_service_acceptance_request(v_prior.id, 'successor_request');
  END IF;
  v_number := COALESCE(v_prior.request_number, 0) + 1;
  -- 00890 delta (SQ-2324): the V22 draft carries the client's address, or NULL
  -- (the Ready-to-send hold) when the client profile has none.
  SELECT NULLIF(btrim(p.email), '') INTO v_address FROM public.profiles p WHERE p.id = v_project.client_id;
  v_draft := public.compose_outbound_draft('service_acceptance_request', v_studio, p_project_id, 'email', 'client',
    jsonb_build_object('client_id', v_project.client_id, 'address', v_address), 'Review the agreed services',
    'Your studio has prepared the agreed services for your review. Open your project to accept them, '
      || 'accept them with conditions, or return them with a note.',
    jsonb_build_object('requestId', v_id, 'projectId', p_project_id, 'requestNumber', v_number,
      'scopeEditionId', v_edition.id),
    'service_acceptance_request', v_id, 'service_acceptance_request:' || v_id, NULL, NULL, v_uid::text);
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
