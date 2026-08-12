-- =====================================================================================
-- 00440 — Stage-2 client access repair
--
-- Stage-2 client reads resolve immutable artifact/authority evidence through
-- sanitized projections. Raw client/coordination policies remain available for
-- legacy decisions only. Discussion authority follows the frozen decision lead
-- for Stage-2 and the mutable designer_clients relationship for legacy rows.
-- =====================================================================================

-- Policy-only helpers live outside the PostgREST-exposed schemas.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- Keep the installed relationship predicate unchanged because pending option
-- rows use it for the legacy-compatible option-ID response rail. Exclude
-- Stage-2 at the raw parent table policy instead.
DROP POLICY IF EXISTS "Clients can view their decisions"
  ON public.client_decisions;
CREATE POLICY "Clients can view their decisions"
ON public.client_decisions FOR SELECT TO authenticated
USING (
  approval_contract IS DISTINCT FROM 'project_artifact_v1'
  AND public.is_addressed_client_decision(id)
);

-- A logged-in coordination party may still read legacy coordination items on
-- its project, but it cannot use this additive policy to bypass Stage-2's
-- frozen-authority projections.
DROP POLICY IF EXISTS coordination_party_decisions_select
  ON public.client_decisions;
CREATE POLICY coordination_party_decisions_select
ON public.client_decisions FOR SELECT TO authenticated
USING (
  project_id IS NOT NULL
  AND approval_contract IS DISTINCT FROM 'project_artifact_v1'
  AND public.is_coordination_party(project_id)
);

-- Private exact resolver. The caller-supplied actor must be the active JWT
-- subject; this prevents a future postgres-owned wrapper from using it as an
-- arbitrary reviewer oracle. Serialization is delegated to the installed,
-- allowlisted project projection so field/redaction behavior has one owner.
CREATE OR REPLACE FUNCTION app_private.project_decision_review_for_actor(
  p_decision_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_item jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT decision.project_id
  INTO v_project_id
  FROM public.client_decisions AS decision
  LEFT JOIN public.project_decision_authority_snapshots AS snapshot
    ON snapshot.decision_id = decision.id
   AND snapshot.project_id = decision.project_id
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1'
    AND (
      public.is_design_studio_comember(decision.designer_id)
      OR snapshot.decision_lead_id = p_actor
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT review.value
  INTO v_item
  FROM jsonb_array_elements(
    public.get_project_decision_reviews(v_project_id)
  ) AS review(value)
  WHERE review.value->>'decisionId' = p_decision_id::text;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION app_private.project_decision_review_for_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.project_decision_review_for_actor(uuid, uuid) IS
  'Private actor-coherent resolver for one sanitized Stage-2 approval item. '
  'It delegates serialization to get_project_decision_reviews and returns '
  'NULL for nonexistent, legacy, or unauthorized decisions.';

-- Exact detail for direct routes. NULL deliberately makes nonexistent and
-- unauthorized IDs indistinguishable to an authenticated caller.
CREATE OR REPLACE FUNCTION public.get_project_decision_review(
  p_decision_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN app_private.project_decision_review_for_actor(
    p_decision_id, v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_decision_review(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_decision_review(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_decision_review(uuid) IS
  'Sanitized exact Stage-2 approval detail for its frozen lead or project '
  'design-studio author. Returns NULL without revealing whether an unauthorized '
  'or nonexistent decision exists.';

-- One stable current-user list across projects. Project grouping lets the
-- installed allowlisted projection retain ownership of every output field and
-- its per-decision frozen-lead filtering.
CREATE OR REPLACE FUNCTION public.list_my_project_decision_reviews()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      item.value
      ORDER BY item.value->>'createdAt', item.value->>'decisionId'
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT DISTINCT decision.project_id
    FROM public.client_decisions AS decision
    LEFT JOIN public.project_decision_authority_snapshots AS snapshot
      ON snapshot.decision_id = decision.id
     AND snapshot.project_id = decision.project_id
    WHERE decision.approval_contract = 'project_artifact_v1'
      AND decision.project_id IS NOT NULL
      AND (
        snapshot.decision_lead_id = v_actor
        OR public.is_design_studio_comember(decision.designer_id)
      )
  ) AS authorized_project
  CROSS JOIN LATERAL jsonb_array_elements(
    public.get_project_decision_reviews(authorized_project.project_id)
  ) AS item(value);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_project_decision_reviews()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_project_decision_reviews()
  TO authenticated;

COMMENT ON FUNCTION public.list_my_project_decision_reviews() IS
  'Stable sanitized Stage-2 approval list across projects for the current '
  'frozen lead or design-studio author. Returns [] and never reviewer IDs.';

-- Narrow row-policy predicate for discussion access. This deliberately does
-- not serialize the review projection: RLS needs only a self-scoped boolean.
-- authenticated requires EXECUTE because PostgreSQL checks function ACLs
-- while evaluating a policy; anon and service_role remain denied.
CREATE OR REPLACE FUNCTION app_private.is_decision_comment_client(
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
      LEFT JOIN public.project_decision_authority_snapshots AS snapshot
        ON snapshot.decision_id = decision.id
       AND snapshot.project_id = decision.project_id
      LEFT JOIN public.designer_clients AS relationship
        ON relationship.id = decision.designer_client_id
      WHERE decision.id = p_decision_id
        AND (
          (
            decision.approval_contract = 'project_artifact_v1'
            AND (
              snapshot.decision_lead_id = auth.uid()
              OR public.is_design_studio_comember(decision.designer_id)
            )
          )
          OR (
            decision.approval_contract
                  IS DISTINCT FROM 'project_artifact_v1'
            AND (
              relationship.designer_id = auth.uid()
              OR relationship.client_id = auth.uid()
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_decision_comment_client(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_decision_comment_client(uuid)
  TO authenticated;

COMMENT ON FUNCTION app_private.is_decision_comment_client(uuid) IS
  'Narrow self-scoped RLS predicate for decision discussion access. Stage-2 '
  'uses immutable authority; legacy decisions retain relationship authority.';

-- Discussion remains non-evidence. Both policies use only the narrow boolean
-- resolver above; INSERT additionally binds the row author to the JWT actor.
DROP POLICY IF EXISTS decision_comments_client_select
  ON public.decision_comments;
DROP POLICY IF EXISTS decision_comments_designer_select
  ON public.decision_comments;
DROP POLICY IF EXISTS decision_comments_participant_select
  ON public.decision_comments;
CREATE POLICY decision_comments_participant_select
ON public.decision_comments FOR SELECT TO authenticated
USING (
  app_private.is_decision_comment_client(decision_id)
);

DROP POLICY IF EXISTS decision_comments_insert
  ON public.decision_comments;
CREATE POLICY decision_comments_insert
ON public.decision_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND app_private.is_decision_comment_client(decision_id)
);
