-- Exact source-boundary fragment for the six-argument open_project_direct.
-- Extracted from 00484 at file SHA-256
-- d0e4f185d306e16bc224c5b8ce62bda2b71af3f15e2dead4f4f6171a927710c2;
-- the moving checked migration has since changed.  The renderer separately
-- pins this fragment and the reviewed function-body hash.

CREATE OR REPLACE FUNCTION public.open_project_direct(
  p_title text,
  p_client_id uuid DEFAULT NULL,
  p_budget_min_cents integer DEFAULT NULL,
  p_budget_max_cents integer DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $open_project_direct$
DECLARE
  v_designer uuid := auth.uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_existing public.projects;
  v_membership_id uuid;
  v_studio_id uuid;
  v_client_relationship_id uuid;
  v_client_relationship_status text;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'open_project_not_authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_title = '' THEN
    RAISE EXCEPTION 'a project title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_budget_min_cents IS NOT NULL
     AND p_budget_max_cents IS NOT NULL
     AND p_budget_min_cents > p_budget_max_cents
  THEN
    RAISE EXCEPTION 'budget band minimum exceeds its maximum'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.user_roles AS user_role
  JOIN public.roles AS role_row ON role_row.id = user_role.role_id
  WHERE user_role.user_id = v_designer
    AND role_row.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  LIMIT 1
  FOR SHARE OF user_role, role_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_project_not_authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT membership.id, membership.organization_id
  INTO v_membership_id, v_studio_id
  FROM public.organization_members AS membership
  JOIN public.organizations AS organization
    ON organization.id = membership.organization_id
  WHERE membership.user_id = v_designer
    AND membership.status = 'active'
    AND membership.role <> 'guest'
    AND organization.type = 'design_studio'
    AND organization.status = 'active'
  ORDER BY membership.created_at, membership.id
  LIMIT 1
  FOR SHARE OF membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_project_not_authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = v_studio_id
    AND organization.type = 'design_studio'
    AND organization.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_project_not_authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT relationship.id, relationship.status
    INTO v_client_relationship_id, v_client_relationship_status
    FROM public.designer_clients AS relationship
    WHERE relationship.designer_id = v_designer
      AND relationship.client_id = p_client_id
      AND relationship.status IN ('lead', 'proposal', 'prospect', 'active')
    ORDER BY CASE relationship.status
               WHEN 'active' THEN 0
               WHEN 'proposal' THEN 1
               WHEN 'prospect' THEN 2
               ELSE 3
             END,
             relationship.created_at,
             relationship.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_project_not_authorized'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.projects AS project
    WHERE project.id = p_id
    FOR SHARE;

    IF FOUND THEN
      IF v_existing.designer_id IS DISTINCT FROM v_designer
         OR v_existing.studio_id IS DISTINCT FROM v_studio_id
         OR v_existing.client_id IS DISTINCT FROM p_client_id
      THEN
        RAISE EXCEPTION 'open_project_not_authorized'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;

  INSERT INTO public.projects (
    id, name, status, designer_id, client_id, created_by, studio_id,
    proposal_id, start_date, budget_min, budget_max
  )
  VALUES (
    v_id, v_title, 'active', v_designer, p_client_id, v_designer, v_studio_id,
    NULL, p_start_date, p_budget_min_cents, p_budget_max_cents
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM public.projects AS project
    WHERE project.id = v_id
    FOR SHARE;

    IF NOT FOUND
       OR v_existing.designer_id IS DISTINCT FROM v_designer
       OR v_existing.studio_id IS DISTINCT FROM v_studio_id
       OR v_existing.client_id IS DISTINCT FROM p_client_id
    THEN
      RAISE EXCEPTION 'open_project_not_authorized'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_client_relationship_status = 'lead' THEN
    UPDATE public.designer_clients AS relationship
    SET status = 'active',
        updated_at = now()
    WHERE relationship.id = v_client_relationship_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.designer_clients AS engaged
        WHERE engaged.designer_id = v_designer
          AND engaged.client_id = p_client_id
          AND engaged.id <> relationship.id
          AND engaged.status <> 'lead'
      );
  ELSIF v_client_relationship_status IN ('proposal', 'prospect') THEN
    UPDATE public.designer_clients AS relationship
    SET status = 'active',
        updated_at = now()
    WHERE relationship.id = v_client_relationship_id;
  END IF;

  RETURN v_id;
END;
$open_project_direct$;
