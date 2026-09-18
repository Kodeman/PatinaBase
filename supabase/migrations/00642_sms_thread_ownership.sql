-- ═══════════════════════════════════════════════════════════════════════════
-- 00642 — Studio-scoped thread ownership and additive conversation pauses
-- Adds the portal write doors over 00639's SELECT-only SMS tables, reusing
-- the union of sms_messages_team_select and sms_messages_studio_select.
-- Table privileges and the service-only unattributed holding row stay intact.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sms_take_thread(p_message_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sms_messages AS m
     SET owner_user_id = v_user_id
   WHERE m.id = p_message_id
     AND m.project_id IS NOT NULL
     AND (
       public.is_project_team_member(m.project_id)
       OR EXISTS (
         SELECT 1 FROM public.projects p
         WHERE p.id = m.project_id
           AND (p.designer_id = v_user_id OR public.is_studio_comember(p.designer_id))
       )
     )
  RETURNING m.owner_user_id INTO v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message access denied' USING ERRCODE = '42501';
  END IF;
  RETURN v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_take_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_take_thread(uuid) TO authenticated;
COMMENT ON FUNCTION public.sms_take_thread(uuid) IS
  'An authenticated member admitted by the message SELECT predicates may take ownership, including taking over from another owner.';

CREATE OR REPLACE FUNCTION public.sms_hand_back_thread(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sms_messages AS m
     SET owner_user_id = NULL
   WHERE m.id = p_message_id
     AND m.owner_user_id = v_user_id
     AND m.project_id IS NOT NULL
     AND (
       public.is_project_team_member(m.project_id)
       OR EXISTS (
         SELECT 1 FROM public.projects p
         WHERE p.id = m.project_id
           AND (p.designer_id = v_user_id OR public.is_studio_comember(p.designer_id))
       )
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the current owner with message access may hand back this thread'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_hand_back_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_hand_back_thread(uuid) TO authenticated;
COMMENT ON FUNCTION public.sms_hand_back_thread(uuid) IS
  'Only the authenticated current owner admitted by the message SELECT predicates may clear ownership.';

CREATE OR REPLACE FUNCTION public.sms_extend_pause(p_message_id uuid, p_hours integer DEFAULT 4)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_project_id uuid;
  v_paused_until timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 72 THEN
    RAISE EXCEPTION 'Pause hours must be between 1 and 72' USING ERRCODE = '22023';
  END IF;

  SELECT m.conversation_id, m.project_id
    INTO v_conversation_id, v_project_id
    FROM public.sms_messages m
   WHERE m.id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message access denied' USING ERRCODE = '42501';
  END IF;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'A project is required to extend a pause' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.is_project_team_member(v_project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = v_project_id
        AND (p.designer_id = v_user_id OR public.is_studio_comember(p.designer_id))
    )
  ) THEN
    RAISE EXCEPTION 'Message access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sms_conversation_context AS context
    (conversation_id, project_id, paused_until)
  VALUES (v_conversation_id, v_project_id, now() + make_interval(hours => p_hours))
  ON CONFLICT (conversation_id, project_id) DO UPDATE
    SET paused_until = greatest(coalesce(context.paused_until, now()), now())
                       + make_interval(hours => p_hours)
  RETURNING paused_until INTO v_paused_until;

  RETURN v_paused_until;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_extend_pause(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_extend_pause(uuid, integer) TO authenticated;
COMMENT ON FUNCTION public.sms_extend_pause(uuid, integer) IS
  'An authenticated member admitted by the message SELECT predicates may add 1–72 hours to its project pause from the later of the current pause or now, never to a holding row.';
