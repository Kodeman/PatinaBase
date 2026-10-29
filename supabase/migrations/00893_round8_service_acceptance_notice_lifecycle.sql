-- ═══════════════════════════════════════════════════════════════════════════
-- 00893 — Round 8 C4 service acceptance: signer notices follow the request
-- (US-52 pre-activation, SQ-2349; review SQ-2348 F1 and F2). Ships INACTIVE.
--
-- 00891 gave each required signer their own awaiting_review V22 notice. Two
-- acts left those notices behind:
-- F1 The request closes on the first required return, or once every required
--    signer has answered. The other signers' unsent notices stayed
--    awaiting_review, so Ready to send still offered them, asking a signer to
--    answer a closed request. The closing branch of
--    _derive_service_acceptance_outcome now discards them through
--    resolve_outbound_drafts (00775), as withdrawal and supersession already
--    do. Only awaiting_review rows change; a sending or sent row is untouched.
-- F2 replace_service_acceptance_signer only retired and inserted signer rows.
--    Now the retired signer's unsent notice is discarded (the kind renderer
--    already refuses it), and a required replacement gets one awaiting_review
--    notice in the 00891 shape, bound to the request, its project and the new
--    signer. A draft request whose only required signer was replaced can be
--    sent again. Nothing is sent: the designer sends it (V22). The key is
--    'service_acceptance_request:<request>:<slot>:<signer>', because
--    outbound_drafts.dedupe_key is unique across every status (00775) and the
--    retired notice keeps the slot key 00891 wrote. A replayed replace returns
--    its receipt before writing anything. The response adds outboundDraftId:
--    the replacement's notice, or null for an optional replacement.
--
-- Redefinitions, each copied verbatim from its latest CREATE OR REPLACE (no
-- later file redefines them) with only the marked delta:
--   _derive_service_acceptance_outcome   00886 -> 00893
--   replace_service_acceptance_signer    00886 -> 00893
-- The REVOKEs restate 00886; nothing is granted (inactive until the C4
-- activation step). The kind renderer (supabase/functions/_shared/
-- outbound-kinds/service_acceptance_request.ts) now also refuses a request
-- that is no longer draft or sent. No backfill (nothing is on Strata).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._derive_service_acceptance_outcome(p_request_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_request public.service_acceptance_requests%ROWTYPE; v_required integer; v_returned integer;
  v_pending integer; v_conditional integer; v_outcome text;
  previous_request text := current_setting('app.service_acceptance_request_id', true);
  previous_outcome text := current_setting('app.service_acceptance_outcome_id', true);
BEGIN
  SELECT * INTO STRICT v_request FROM public.service_acceptance_requests WHERE id = p_request_id FOR UPDATE;
  SELECT count(*), count(*) FILTER (WHERE x.response = 'return'), count(*) FILTER (WHERE x.id IS NULL),
         count(*) FILTER (WHERE x.response = 'accept_with_conditions')
    INTO v_required, v_returned, v_pending, v_conditional
  FROM public.service_acceptance_signers s
  LEFT JOIN public.service_acceptance_responses x ON x.signer_id = s.id
  WHERE s.request_id = p_request_id AND s.status = 'active' AND s.required;
  IF v_required = 0 THEN
    RAISE EXCEPTION 'signer_policy_no_required_signer' USING ERRCODE = 'check_violation';
  END IF;
  v_outcome := CASE WHEN v_returned > 0 THEN 'returned' WHEN v_pending > 0 THEN 'pending'
    WHEN v_conditional > 0 THEN 'accepted_with_conditions' ELSE 'accepted' END;
  IF v_outcome <> 'pending' AND v_request.lifecycle = 'sent' THEN
    PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
    PERFORM set_config('app.service_acceptance_outcome_id', p_request_id::text, true);
    UPDATE public.service_acceptance_requests SET aggregate_outcome = v_outcome, lifecycle = 'closed',
      closed_reason = v_outcome, closed_at = clock_timestamp()
    WHERE id = p_request_id;
    PERFORM set_config('app.service_acceptance_outcome_id', COALESCE(previous_outcome, ''), true);
    PERFORM public._lapse_service_acceptance_intakes(p_request_id, 'request_terminal');
    -- 00893 delta (SQ-2349 F1): a closed request takes no answer, so every
    -- signer notice still awaiting review is discarded, as on withdrawal and
    -- supersession. A sending or sent notice is left as it is.
    PERFORM public.resolve_outbound_drafts('service_acceptance_request', p_request_id);
    PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_request, ''), true);
  END IF;
  RETURN v_outcome;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_service_acceptance_signer(
  p_request_id uuid, p_signer_id uuid, p_new_profile_id uuid, p_new_household_person_id uuid,
  p_expected_signer_policy_revision integer, p_reason text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_signers%ROWTYPE; v_target public.service_acceptance_signers%ROWTYPE;
  v_signers jsonb; v_lapsed uuid[]; v_revision integer; v_new_id uuid := extensions.gen_random_uuid();
  v_draft uuid;
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_acceptance_request(p_request_id, true);
  IF NOT public._is_service_acceptance_studio_admin(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'signerId', p_signer_id,
    'newProfileId', p_new_profile_id, 'newHouseholdPersonId', p_new_household_person_id,
    'expectedSignerPolicyRevision', p_expected_signer_policy_revision, 'reason', p_reason));
  SELECT * INTO v_existing FROM public.service_acceptance_signers
  WHERE request_id = p_request_id AND replacement_client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.replaced_by <> v_uid OR v_existing.replacement_request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('signerId', v_existing.replaced_by_signer_id,
      'signerPolicyRevision', v_existing.replacement_policy_revision,
      'lapsedIntakeIds', to_jsonb(v_existing.replacement_lapsed_intake_ids), 'replayed', true,
      'outboundDraftId', (SELECT d.id FROM public.outbound_drafts d WHERE d.dedupe_key = 'service_acceptance_request:'
        || p_request_id || ':' || v_existing.slot || ':' || v_existing.replaced_by_signer_id));
  END IF;
  IF v_request.lifecycle NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_expected_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_target FROM public.service_acceptance_signers WHERE id = p_signer_id AND request_id = p_request_id;
  IF v_target.id IS NULL OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' OR length(p_reason) > 2000
     OR (p_new_profile_id IS NULL) = (p_new_household_person_id IS NULL) THEN
    RAISE EXCEPTION 'service_acceptance_replacement_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
      'householdPersonId', s.household_person_id) ORDER BY s.slot)
    || jsonb_build_array(jsonb_build_object('slot', v_target.slot, 'required', v_target.required,
      'profileId', p_new_profile_id, 'householdPersonId', p_new_household_person_id))
    INTO v_signers
  FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id AND s.status = 'active' AND s.id <> v_target.id;
  v_signers := COALESCE(v_signers, jsonb_build_array(jsonb_build_object('slot', v_target.slot,
    'required', v_target.required, 'profileId', p_new_profile_id, 'householdPersonId', p_new_household_person_id)));
  PERFORM public._validate_service_acceptance_signers(
    (SELECT source_proposal_id FROM public.project_scope_editions WHERE id = v_request.scope_edition_id), v_signers);
  v_revision := v_request.signer_policy_revision + 1;
  v_lapsed := public._lapse_service_acceptance_intakes(p_request_id, 'signer_policy_revised');
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  -- One statement: the active-slot index sees the old signer retired before
  -- the insert, and the self-FK sees the new signer at statement end.
  WITH retired AS (
    UPDATE public.service_acceptance_signers SET status = 'replaced', replaced_by_signer_id = v_new_id,
      replacement_reason = btrim(p_reason), replaced_by = v_uid, replaced_at = clock_timestamp(),
      replacement_client_request_id = v_key, replacement_request_hash = v_hash,
      replacement_policy_revision = v_revision, replacement_lapsed_intake_ids = v_lapsed
    WHERE id = v_target.id RETURNING id
  )
  INSERT INTO public.service_acceptance_signers(id, request_id, slot, required, profile_id, household_person_id,
    policy_slot)
  SELECT v_new_id, p_request_id, v_target.slot, v_target.required, p_new_profile_id, p_new_household_person_id,
    v_target.policy_slot
  FROM (SELECT count(*) FROM retired) dependency;
  -- 00893 delta (SQ-2349 F2): the notice moves with the signer. The retired
  -- signer's unsent notice (matched by recipient, as the kind renderer binds
  -- it) is discarded; a sending or sent one is left as it is. A required
  -- replacement gets one awaiting_review notice in the 00891 shape. Its key
  -- adds the signer id: dedupe_key is unique across every status, and the
  -- retired notice keeps the slot key. Nothing is sent (V22).
  UPDATE public.outbound_drafts SET status = 'discarded', discarded_at = now(), discarded_by = NULL
  WHERE ref_type = 'service_acceptance_request' AND ref_id = p_request_id AND kind = 'service_acceptance_request'
    AND status = 'awaiting_review'
    AND CASE WHEN v_target.household_person_id IS NOT NULL THEN to_contact_id = v_target.household_person_id
      ELSE to_client_id = v_target.profile_id AND to_contact_id IS NULL END;
  INSERT INTO public.outbound_drafts (organization_id, project_id, kind, channel, recipient_kind,
    to_contact_id, to_client_id, to_party_id, to_address, subject, body, payload, ref_type, ref_id, dedupe_key,
    due_at, expires_at, composed_by)
  SELECT public.project_recorded_studio(v_request.project_id), v_request.project_id, 'service_acceptance_request',
    'email', 'client', p_new_household_person_id, COALESCE(p_new_profile_id, sc.profile_id), NULL,
    NULLIF(btrim(p.email), ''), 'Review the agreed services',
    'Your studio has prepared the agreed services for your review. Open your project to accept them, '
      || 'accept them with conditions, or return them with a note.',
    jsonb_build_object('requestId', p_request_id, 'projectId', v_request.project_id,
      'requestNumber', v_request.request_number, 'scopeEditionId', v_request.scope_edition_id),
    'service_acceptance_request', p_request_id,
    'service_acceptance_request:' || p_request_id || ':' || v_target.slot || ':' || v_new_id, NULL, NULL, v_uid::text
  FROM (SELECT 1) one
  LEFT JOIN public.studio_contacts sc ON sc.id = p_new_household_person_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(p_new_profile_id, sc.profile_id)
  WHERE v_target.required
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_draft;
  UPDATE public.service_acceptance_requests SET signer_policy_revision = v_revision WHERE id = p_request_id;
  PERFORM public._derive_service_acceptance_outcome(p_request_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('signerId', v_new_id, 'signerPolicyRevision', v_revision,
    'lapsedIntakeIds', to_jsonb(v_lapsed), 'replayed', false, 'outboundDraftId', v_draft);
END;
$$;

-- Restated from 00886: both stay revoked from every API role until activation.
REVOKE ALL ON FUNCTION public._derive_service_acceptance_outcome(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
