-- ═══════════════════════════════════════════════════════════════════════════
-- 00896 — Round 8 C4 service acceptance: one person answers one slot
-- (US-52 release review, fix lane F-A defect 1, HIGH). Ships INACTIVE.
--
-- 00894 let a card link make one profile match two slots, and resolved the
-- match with ORDER BY ... LIMIT 1, refusing a second answer only by signer_id.
-- So one person could answer the client slot, then (with a card relinked to
-- them) answer a second required slot: one person satisfied two required
-- signers. Now:
--   * respond holds every card the request's slots hold (FOR SHARE, by id)
--     before it reads any link, then counts the caller's matching slots;
--   * more than one active match is refused with signer_identity_collision
--     (55000; the HINT names replace_service_acceptance_signer, the audited
--     way to repair the slot). No match is ever chosen by ordering;
--   * a person with any response on the request (responder_profile_id) is
--     refused already_responded on every other slot of it;
--   * the list returns viewerSignerId only for a single active match. On a
--     collision it shows the request with viewerRole 'observer'.
-- Lock order (C4 §2.3) is unchanged in kind: _lock_service_acceptance_request
-- (project, edition, request, signers by id), then the slots' cards by id.
--
-- Redefinitions, each copied verbatim from its latest CREATE OR REPLACE with
-- only the marked 00896 delta:
--   respond_service_acceptance           00886 -> 00894 -> 00896
--   get_my_service_acceptance_requests   00886 -> 00894 -> 00896
-- _is_service_acceptance_client_reader (00894) is unchanged: reading evidence
-- needs no single slot. Signatures, return shapes, search_path and SECURITY
-- DEFINER are unchanged. The ACL statements restate 00894. No backfill.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.respond_service_acceptance(
  p_request_id uuid, p_response text, p_conditions jsonb, p_return_reason text, p_scope_content_hash text,
  p_evidence_manifest_hash text, p_signer_policy_revision integer, p_client_request_id text,
  p_method text DEFAULT 'portal_authenticated')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_responses%ROWTYPE; v_signer public.service_acceptance_signers%ROWTYPE;
  v_conditions jsonb; v_response_id uuid := extensions.gen_random_uuid(); v_matches bigint; v_active bigint;
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
  -- 00896 delta (F-A defect 1): hold every card a slot of this request holds,
  -- by id, before reading any link. A relink or unlink that committed first is
  -- read here; one that starts later waits for this response (C4 §2.3).
  PERFORM 1 FROM public.studio_contacts sc
  WHERE sc.id IN (SELECT s.household_person_id FROM public.service_acceptance_signers s
    WHERE s.request_id = p_request_id AND s.household_person_id IS NOT NULL)
  ORDER BY sc.id FOR SHARE;
  -- 00896 delta: every slot the caller matches (a profile slot of theirs, or a
  -- card slot whose card links to them now). An ambiguous match is refused,
  -- never resolved by ordering.
  SELECT count(*), count(*) FILTER (WHERE s.status = 'active') INTO v_matches, v_active
  FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id
    AND (s.profile_id = v_uid OR EXISTS (SELECT 1 FROM public.studio_contacts sc
      WHERE sc.id = s.household_person_id AND sc.profile_id = v_uid));
  IF v_matches = 0 THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_request.lifecycle <> 'sent' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_active = 0 THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_active > 1 THEN
    RAISE EXCEPTION 'signer_identity_collision' USING ERRCODE = 'object_not_in_prerequisite_state',
      HINT = 'One person holds more than one active slot; the studio replaces one with replace_service_acceptance_signer.';
  END IF;
  SELECT s.* INTO STRICT v_signer FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id AND s.status = 'active'
    AND (s.profile_id = v_uid OR EXISTS (SELECT 1 FROM public.studio_contacts sc
      WHERE sc.id = s.household_person_id AND sc.profile_id = v_uid));
  IF p_scope_content_hash IS DISTINCT FROM v_request.scope_content_hash
     OR p_evidence_manifest_hash IS DISTINCT FROM v_request.evidence_manifest_hash
     OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
    RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'PT409';
  END IF;
  IF p_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
  END IF;
  -- 00896 delta: a person who answered any slot of this request answers no other.
  IF EXISTS (SELECT 1 FROM public.service_acceptance_responses WHERE signer_id = v_signer.id)
     OR EXISTS (SELECT 1 FROM public.service_acceptance_responses
       WHERE request_id = p_request_id AND responder_profile_id = v_uid) THEN
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
  -- household-card slot whose card links to them now.
  -- 00896 delta (F-A defect 1): only a single match is the caller's slot. Two
  -- or more is the collision respond_service_acceptance refuses, so the caller
  -- sees the request as an observer until the studio replaces a slot.
  LEFT JOIN LATERAL (SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END AS id,
      CASE WHEN count(*) = 1 THEN bool_and(s.required) END AS required, count(*) AS matches
    FROM public.service_acceptance_signers s
    WHERE s.request_id = r.id AND s.status = 'active'
      AND (s.profile_id = auth.uid() OR EXISTS (SELECT 1 FROM public.studio_contacts sc
        WHERE sc.id = s.household_person_id AND sc.profile_id = auth.uid()))) mine ON true
  WHERE auth.uid() IS NOT NULL AND r.sent_at IS NOT NULL AND (mine.matches > 0 OR p.client_id = auth.uid());
$$;

-- Restated from 00894: respond stays revoked from every API role until the C4
-- activation step; the list keeps its read grant to authenticated.
REVOKE ALL ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_service_acceptance_requests() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_service_acceptance_requests() TO authenticated;
