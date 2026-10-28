-- ═══════════════════════════════════════════════════════════════════════════
-- 00894 — Round 8 C4 service acceptance: a household-card signer answers
-- through the card's linked profile (US-52 pre-RC, SQ-2352; review SQ-2351
-- R1). Ships INACTIVE.
--
-- A signer slot holds a profile or a household card (studio_contacts person
-- card), never both (service_acceptance_signers_person_ck, 00886). A
-- replacement from the section stores a card. 00893 sends that card's linked
-- profile an actionable notice. But the three consumer authorities matched
-- only signer.profile_id = auth.uid(), so the linked person could not list the
-- request, read its evidence or respond.
--
-- Identity rule (orchestrator ruling on SQ-2352, 2026-10-28): the authority
-- of a household-card slot belongs to the profile that card links to NOW
-- (studio_contacts.profile_id). That link is set by the studio, the same trust
-- the signer binders already give it on the profile path (00869
-- _validate_scope_signer_parts, 00886 _validate_service_acceptance_signers).
-- No consent is asked of the person. The link is read at list, read and
-- response time and never snapshotted:
--   * a card linked after the request was sent qualifies through that link;
--   * a card that was unlinked or re-pointed stops qualifying, or qualifies
--     only its new profile;
--   * an unlinked card stays paper-only (K5 paper intake is unchanged);
--   * only an active slot qualifies. A replaced card slot's linked profile is
--     refused (signer_not_active), as a replaced profile signer is.
-- A response records signer_id (the household slot) and responder_profile_id
-- (the responding auth.uid(), which is the card's link at that moment). So
-- who answered for the slot can be reviewed afterwards, whatever the link
-- later becomes. respond_service_acceptance also takes the card FOR SHARE
-- after the signer locks, so a concurrent relink or unlink is ordered before
-- or after the response, never in between. Lock order (C4 §2.3):
-- _lock_service_acceptance_request (project, edition, request, signers by
-- id), then the responding card.
--
-- One person, one slot: the binders refuse two slots for one profile, but a
-- link moved later can make a profile match a profile slot and a card slot.
-- Both the list and the response then resolve to the same slot: active
-- first, then the profile slot, then the newest. The list still shows the
-- request once.
--
-- Redefinitions, each copied verbatim from its latest CREATE OR REPLACE (no
-- later file redefines them), with only the marked identity delta:
--   respond_service_acceptance             00886 -> 00894
--   get_my_service_acceptance_requests     00886 -> 00894
--   _is_service_acceptance_client_reader   00889 -> 00894 (backs
--     get_my_service_acceptance_evidence and the project-documents storage
--     predicate _can_read_service_acceptance_evidence_object)
-- Signatures, return shapes, search_path and SECURITY DEFINER are unchanged.
-- The ACL statements restate 00886 and 00889. respond stays revoked
-- until the C4 activation step; the list keeps its read grant to
-- authenticated. No backfill: nothing is on Strata.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.respond_service_acceptance(
  p_request_id uuid, p_response text, p_conditions jsonb, p_return_reason text, p_scope_content_hash text,
  p_evidence_manifest_hash text, p_signer_policy_revision integer, p_client_request_id text,
  p_method text DEFAULT 'portal_authenticated')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_responses%ROWTYPE; v_signer public.service_acceptance_signers%ROWTYPE;
  v_conditions jsonb; v_response_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_request := public._lock_service_acceptance_request(p_request_id, false);
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'response', p_response,
    'conditions', p_conditions, 'returnReason', p_return_reason, 'scopeContentHash', p_scope_content_hash,
    'evidenceManifestHash', p_evidence_manifest_hash, 'signerPolicyRevision', p_signer_policy_revision,
    'method', p_method));
  SELECT * INTO v_existing FROM public.service_acceptance_responses
  WHERE request_id = p_request_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.responder_profile_id <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_acceptance_response_receipt(v_existing.id, true);
  END IF;
  -- 00894 delta (SQ-2352 R1): the caller's slot is a profile slot of theirs,
  -- or a household-card slot whose card links to them now. Active first, then
  -- the profile slot, then the newest (the list resolves the same way).
  SELECT s.* INTO v_signer FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id
    AND (s.profile_id = v_uid OR EXISTS (SELECT 1 FROM public.studio_contacts sc
      WHERE sc.id = s.household_person_id AND sc.profile_id = v_uid))
  ORDER BY (s.status = 'active') DESC, (s.profile_id IS NOT NULL) DESC, s.created_at DESC LIMIT 1;
  IF v_signer.id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00894 delta (SQ-2352 R1): hold the card's link until this response
  -- commits. A relink or unlink that committed first is re-read here.
  IF v_signer.profile_id IS NULL THEN
    PERFORM 1 FROM public.studio_contacts
    WHERE id = v_signer.household_person_id AND profile_id = v_uid FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF v_request.lifecycle <> 'sent' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_signer.status <> 'active' THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_scope_content_hash IS DISTINCT FROM v_request.scope_content_hash
     OR p_evidence_manifest_hash IS DISTINCT FROM v_request.evidence_manifest_hash
     OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
    RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'serialization_failure';
  END IF;
  IF p_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'serialization_failure';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_acceptance_responses WHERE signer_id = v_signer.id) THEN
    RAISE EXCEPTION 'already_responded' USING ERRCODE = 'unique_violation';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('portal_authenticated','ios_authenticated') THEN
    RAISE EXCEPTION 'service_acceptance_response_invalid' USING ERRCODE = 'check_violation';
  END IF;
  v_conditions := public._service_acceptance_conditions(p_response, p_conditions, p_return_reason);
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  INSERT INTO public.service_acceptance_responses(id, request_id, signer_id, response, conditions, return_reason,
    method, responder_profile_id, presented_scope_content_hash, presented_evidence_manifest_hash,
    presented_signer_policy_revision, client_request_id, request_hash)
  VALUES (v_response_id, p_request_id, v_signer.id, p_response, v_conditions, NULLIF(btrim(p_return_reason), ''),
    p_method, v_uid, p_scope_content_hash, p_evidence_manifest_hash, p_signer_policy_revision, v_key, v_hash);
  PERFORM public._derive_service_acceptance_outcome(p_request_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_acceptance_response_receipt(v_response_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_service_acceptance_requests()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(public._service_acceptance_request_json(r.id, false) || jsonb_build_object(
      'viewerRole', CASE WHEN mine.required THEN 'signer_required' WHEN mine.id IS NOT NULL THEN 'signer_optional'
        ELSE 'observer' END,
      'viewerSignerId', mine.id) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
  FROM public.service_acceptance_requests r
  JOIN public.projects p ON p.id = r.project_id
  -- 00894 delta (SQ-2352 R1): the caller's active slot, a profile slot or a
  -- household-card slot whose card links to them now; one slot per request,
  -- resolved as respond_service_acceptance resolves it.
  LEFT JOIN LATERAL (SELECT s.id, s.required FROM public.service_acceptance_signers s
    WHERE s.request_id = r.id AND s.status = 'active'
      AND (s.profile_id = auth.uid() OR EXISTS (SELECT 1 FROM public.studio_contacts sc
        WHERE sc.id = s.household_person_id AND sc.profile_id = auth.uid()))
    ORDER BY (s.profile_id IS NOT NULL) DESC, s.created_at DESC LIMIT 1) mine ON true
  WHERE auth.uid() IS NOT NULL AND r.sent_at IS NOT NULL AND (mine.id IS NOT NULL OR p.client_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public._is_service_acceptance_client_reader(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_acceptance_requests r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = p_request_id AND r.sent_at IS NOT NULL
      AND (p.client_id = auth.uid() OR EXISTS (SELECT 1 FROM public.service_acceptance_signers s
        WHERE s.request_id = r.id AND s.status = 'active' AND (s.profile_id = auth.uid()
          -- 00894 delta (SQ-2352 R1): or the household card the slot holds links to the caller now.
          OR EXISTS (SELECT 1 FROM public.studio_contacts sc
            WHERE sc.id = s.household_person_id AND sc.profile_id = auth.uid())))));
$$;

-- Restated from 00886 and 00889: respond and the reader predicate stay revoked
-- from every API role (respond until the C4 activation step); the list keeps
-- its read grant to authenticated.
REVOKE ALL ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_service_acceptance_requests() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_service_acceptance_requests() TO authenticated;
REVOKE ALL ON FUNCTION public._is_service_acceptance_client_reader(uuid) FROM PUBLIC, anon, authenticated, service_role;
