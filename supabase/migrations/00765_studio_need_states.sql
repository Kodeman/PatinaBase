-- ═══════════════════════════════════════════════════════════════════════════
-- 00765 — studio_need_states: per-member Day Sheet need state (US-25 W1)
-- Adds the own-row state table and its studio-checked writer.
-- No installed function or table is redefined. (The DROP below removes only
-- this file's own pre-Strata six-argument draft from local databases.)
--
-- SQ-778 N5 — every Day Sheet line holds a state, so the writer resolves the
-- studio from the line's record:
--   * a project with a studio: projects.studio_id;
--   * otherwise the engagement row the need list keys on
--     (`project_id ?? engagement_id`, document_state 00590): a legacy project
--     with no studio, a proposal chain root, a lead or a designer_clients row.
--     None of those carries a studio column, so the studio is the active
--     design studio seat the caller shares with the engagement's designer (the
--     caller may be the designer); a manufacturer, contractor or admin team
--     overlap is no shared studio (SQ-777 F4). When they share several studios, the lowest organization id
--     wins, so the choice is deterministic; when they share none, the denial
--     is the same "not permitted" 42501 as for a missing record.
-- project_id is stored only for a real project; NULL for an engagement row.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.set_need_state(text, uuid, text, text, date, text, uuid);
--   DROP TABLE public.studio_need_states;
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_need_states (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  need_key text NOT NULL CHECK (char_length(need_key) BETWEEN 1 AND 255),
  deferred_until date,
  acted_at timestamptz,
  waiting_on text,
  set_aside_until date,
  set_aside_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, need_key)
);

CREATE INDEX IF NOT EXISTS idx_studio_need_states_user_organization
  ON public.studio_need_states (user_id, organization_id);

ALTER TABLE public.studio_need_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_need_states_select_own ON public.studio_need_states;
CREATE POLICY studio_need_states_select_own ON public.studio_need_states
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.studio_need_states FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studio_need_states TO authenticated;
GRANT ALL ON public.studio_need_states TO service_role;

COMMENT ON TABLE public.studio_need_states IS
  'Per-user state for a studio Day Sheet need. Authenticated users can select only their own rows; all writes use set_need_state.';

DROP FUNCTION IF EXISTS public.set_need_state(text, uuid, text, text, date, text);

CREATE OR REPLACE FUNCTION public.set_need_state(
  p_need_key text,
  p_project_id uuid,
  p_action text,
  p_waiting_on text DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_reason text DEFAULT NULL,
  -- The document_state engagement_id of a line that may have no project:
  -- projects.id, a proposal chain root, leads.id or designer_clients.id.
  p_engagement_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_target uuid := coalesce(p_project_id, p_engagement_id);
  v_org_id uuid;
  v_project_id uuid;
  v_designer_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_need_key IS NULL OR char_length(p_need_key) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid need key' USING ERRCODE = '22023';
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'project or engagement is required' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.studio_id, coalesce(p.designer_id, p.lead_designer_id, p.created_by)
  INTO v_project_id, v_org_id, v_designer_id
  FROM public.projects p
  WHERE p.id = v_target;

  -- Not a project: only an engagement id may name a pre-project record.
  IF v_project_id IS NULL AND p_project_id IS NULL THEN
    SELECT pr.designer_id INTO v_designer_id FROM public.proposals pr WHERE pr.id = v_target;
    IF v_designer_id IS NULL THEN
      SELECT l.designer_id INTO v_designer_id FROM public.leads l WHERE l.id = v_target;
    END IF;
    IF v_designer_id IS NULL THEN
      SELECT dc.designer_id INTO v_designer_id FROM public.designer_clients dc WHERE dc.id = v_target;
    END IF;
  END IF;

  -- No studio on the record: the active studio the caller shares with its designer.
  IF v_org_id IS NULL AND v_designer_id IS NOT NULL THEN
    SELECT me.organization_id INTO v_org_id
    FROM public.organization_members me
    JOIN public.organization_members d
      ON d.organization_id = me.organization_id
     AND d.user_id = v_designer_id
     AND d.status = 'active'
     AND d.role <> 'guest'
    -- SQ-777 F4 — only a design studio is a shared studio: an overlap through a
    -- manufacturer, a contractor or an admin team is no standing here.
    JOIN public.organizations o
      ON o.id = me.organization_id AND o.status = 'active' AND o.type = 'design_studio'
    WHERE me.user_id = v_uid
      AND me.status = 'active'
      AND me.role <> 'guest'
    ORDER BY me.organization_id
    LIMIT 1;
  END IF;

  -- A missing record, a foreign one and a guest seat get the same denial.
  IF v_org_id IS NULL OR NOT public.is_active_org_member(v_org_id) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'clear' THEN
    DELETE FROM public.studio_need_states
    WHERE user_id = v_uid AND need_key = p_need_key;
    RETURN;
  ELSIF p_action = 'not_today' THEN
    IF p_until IS NULL THEN
      RAISE EXCEPTION 'not_today requires until' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.studio_need_states (
      user_id, organization_id, project_id, need_key, deferred_until,
      acted_at, waiting_on, set_aside_until, set_aside_reason, updated_at
    ) VALUES (v_uid, v_org_id, v_project_id, p_need_key, p_until, NULL, NULL, NULL, NULL, now())
    ON CONFLICT (user_id, need_key) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      project_id = EXCLUDED.project_id,
      deferred_until = EXCLUDED.deferred_until,
      acted_at = NULL, waiting_on = NULL, set_aside_until = NULL,
      set_aside_reason = NULL, updated_at = now();
  ELSIF p_action = 'acted' THEN
    INSERT INTO public.studio_need_states (
      user_id, organization_id, project_id, need_key, deferred_until,
      acted_at, waiting_on, set_aside_until, set_aside_reason, updated_at
    ) VALUES (v_uid, v_org_id, v_project_id, p_need_key, NULL, now(), p_waiting_on, NULL, NULL, now())
    ON CONFLICT (user_id, need_key) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      project_id = EXCLUDED.project_id,
      deferred_until = NULL, acted_at = now(), waiting_on = EXCLUDED.waiting_on,
      set_aside_until = NULL, set_aside_reason = NULL, updated_at = now();
  ELSIF p_action = 'set_aside' THEN
    IF p_until IS NULL OR p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'set_aside requires until and reason' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.studio_need_states (
      user_id, organization_id, project_id, need_key, deferred_until,
      acted_at, waiting_on, set_aside_until, set_aside_reason, updated_at
    ) VALUES (v_uid, v_org_id, v_project_id, p_need_key, NULL, NULL, NULL, p_until, p_reason, now())
    ON CONFLICT (user_id, need_key) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      project_id = EXCLUDED.project_id,
      deferred_until = NULL, acted_at = NULL, waiting_on = NULL,
      set_aside_until = EXCLUDED.set_aside_until,
      set_aside_reason = EXCLUDED.set_aside_reason, updated_at = now();
  ELSE
    RAISE EXCEPTION 'unsupported need state action' USING ERRCODE = '22023';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.set_need_state(text, uuid, text, text, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_need_state(text, uuid, text, text, date, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.set_need_state(text, uuid, text, text, date, text, uuid) IS
  'Sets or clears the authenticated caller''s state for a Day Sheet need after verifying active membership in the studio of the line''s project, or of its engagement (the seat the caller shares with the engagement designer).';
