-- ═══════════════════════════════════════════════════════════════════════════
-- 00765 — studio_need_states: per-member Day Sheet need state (US-25 W1)
-- Adds the own-row state table and its project-organization-checked writer.
-- No installed function or table is redefined.
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.set_need_state(text, uuid, text, text, date, text);
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

CREATE OR REPLACE FUNCTION public.set_need_state(
  p_need_key text,
  p_project_id uuid,
  p_action text,
  p_waiting_on text DEFAULT NULL,
  p_until date DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_need_key IS NULL OR char_length(p_need_key) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid need key' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project is required' USING ERRCODE = '22023';
  END IF;

  SELECT p.studio_id INTO v_org_id
  FROM public.projects p
  WHERE p.id = p_project_id;
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
    ) VALUES (v_uid, v_org_id, p_project_id, p_need_key, p_until, NULL, NULL, NULL, NULL, now())
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
    ) VALUES (v_uid, v_org_id, p_project_id, p_need_key, NULL, now(), p_waiting_on, NULL, NULL, now())
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
    ) VALUES (v_uid, v_org_id, p_project_id, p_need_key, NULL, NULL, NULL, p_until, p_reason, now())
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

REVOKE ALL ON FUNCTION public.set_need_state(text, uuid, text, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_need_state(text, uuid, text, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.set_need_state(text, uuid, text, text, date, text) IS
  'Sets or clears the authenticated caller''s state for a Day Sheet need after verifying active membership in the project studio.';
