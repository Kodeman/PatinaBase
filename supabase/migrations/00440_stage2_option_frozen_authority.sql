-- =====================================================================================
-- 00440 — Stage-2 option visibility follows frozen decision authority
--
-- A studio may legitimately update designer_clients.client_id. Legacy option reads
-- continue to follow that mutable relationship, but immutable Stage-2 approval options
-- must stay addressed to the authority snapshot's exact frozen household lead.
-- The installed studio read policy and option-ID response rail remain unchanged.
-- =====================================================================================

CREATE OR REPLACE FUNCTION app_private.is_stage2_option_client(
  p_decision_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.client_decisions AS decision
      JOIN public.project_decision_authority_snapshots AS snapshot
        ON snapshot.decision_id = decision.id
       AND snapshot.project_id = decision.project_id
      WHERE decision.id = p_decision_id
        AND decision.approval_contract = 'project_artifact_v1'
        AND snapshot.decision_lead_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_stage2_option_client(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_stage2_option_client(uuid)
  TO authenticated;

COMMENT ON FUNCTION app_private.is_stage2_option_client(uuid) IS
  'Self-scoped Stage-2 option RLS predicate bound to the immutable authority '
  'snapshot lead. It exposes no authority row or reviewer identity.';

DROP POLICY IF EXISTS "Clients can view their decision options"
  ON public.client_decision_options;
CREATE POLICY "Clients can view their decision options"
ON public.client_decision_options FOR SELECT TO authenticated
USING (
  app_private.is_stage2_option_client(decision_id)
  OR EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND decision.approval_contract IS DISTINCT FROM 'project_artifact_v1'
      AND public.is_addressed_client_decision(decision.id)
  )
);

COMMENT ON POLICY "Clients can view their decision options"
  ON public.client_decision_options IS
  'Stage-2 option reads follow the immutable authority-snapshot lead; legacy '
  'option reads retain the installed mutable addressed-client relationship.';
