-- ═══════════════════════════════════════════════════════════════════════════
-- 00895 — Round 8 C6 completion reader: household-card signer identity.
-- US-52 pre-RC, SQ-2354; closes SQ-2353 F1. Ships INACTIVE.
--
-- Lineage: get_studio_service_completion 00888 -> 00895. Latest body copied
-- verbatim, changing only its client identity predicate to match 00894:
-- an active slot's household card admits the profile it links to NOW.
-- Re-pointing or unlinking moves or removes that authority; replaced slots
-- never qualify. No snapshot, new helper, policy or consent mechanism.
-- Project-client authority, sent-request requirement, studio branch, client
-- projection, sorting, signature, SECURITY DEFINER and search_path unchanged.
-- ACLs below restate 00888; no mutation is activated. Nothing is on Strata.
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
      WHERE c.project_id = p_project_id AND c.revoked_at IS NULL), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_studio_service_completion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_studio_service_completion(uuid) TO authenticated;
