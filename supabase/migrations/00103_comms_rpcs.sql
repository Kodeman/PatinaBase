-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: In-App Messaging — RPCs
-- Spec: docs/prds/in-app-messaging-prd.md §12
-- Description:
--   Compound operations that the hooks in @patina/supabase call. Each RPC is
--   SECURITY DEFINER so it can perform multi-row writes atomically while
--   still re-checking authorization against auth.uid().
--
--   Functions defined:
--     • rpc_start_direct_thread(counterpart UUID)
--         — idempotent: returns existing direct thread between caller and
--           counterpart, or creates one with both participants.
--     • rpc_start_project_thread(project UUID)
--         — idempotent: returns the project's group thread, creating it on
--           first call with the designer + client + admin participants.
--     • rpc_start_vendor_brief(vendor UUID, project UUID, body TEXT)
--         — creates a vendor_brief thread, seeds a system message, and posts
--           the designer's opening message in one tx.
--     • rpc_mark_thread_read(thread_id UUID)
--         — bumps the caller's last_read_at for the thread to now().
--     • rpc_unread_summary()
--         — returns per-thread + total unread counts for the caller; powers
--           the inbox badge.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Internal helper: resolve a profile's thread role from their profiles.role.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.comms_resolve_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'admin'    THEN 'admin'
    WHEN p.role = 'designer' THEN 'designer'
    WHEN p.role = 'vendor'   THEN 'vendor'
    ELSE 'client'
  END
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. rpc_start_direct_thread(counterpart)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_start_direct_thread(counterpart UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_thread   UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'rpc_start_direct_thread requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF counterpart IS NULL OR counterpart = v_caller THEN
    RAISE EXCEPTION 'counterpart must be a different profile than the caller'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Find an existing direct thread between these two users.
  SELECT t.id INTO v_thread
    FROM public.comms_threads t
   WHERE t.kind = 'direct'
     AND EXISTS (
       SELECT 1 FROM public.comms_thread_participants p
        WHERE p.thread_id = t.id AND p.profile_id = v_caller AND p.left_at IS NULL
     )
     AND EXISTS (
       SELECT 1 FROM public.comms_thread_participants p
        WHERE p.thread_id = t.id AND p.profile_id = counterpart AND p.left_at IS NULL
     )
   ORDER BY t.created_at ASC
   LIMIT 1;

  IF v_thread IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  -- Create the thread + both participants in one tx; cardinality trigger
  -- defers to commit so the half-built state is allowed mid-tx.
  INSERT INTO public.comms_threads (kind, created_by)
    VALUES ('direct', v_caller)
    RETURNING id INTO v_thread;

  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
    VALUES
      (v_thread, v_caller,    public.comms_resolve_role(v_caller)),
      (v_thread, counterpart, public.comms_resolve_role(counterpart));

  RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_start_direct_thread(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. rpc_start_project_thread(project)
--    Resolves to the existing project group thread or creates one with the
--    designer (project owner) + client as participants.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_start_project_thread(p_project_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_thread       UUID;
  v_designer_id  UUID;
  v_client_id    UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'rpc_start_project_thread requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- projects.designer_id / projects.client_id added in 00066. Both must be set.
  SELECT pr.designer_id, pr.client_id
    INTO v_designer_id, v_client_id
    FROM public.projects pr
   WHERE pr.id = p_project_id;

  IF v_designer_id IS NULL OR v_client_id IS NULL THEN
    RAISE EXCEPTION 'project % has no designer/client pair set', p_project_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_caller <> v_designer_id AND v_caller <> v_client_id THEN
    RAISE EXCEPTION 'caller is not part of project %', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent fetch.
  SELECT id INTO v_thread
    FROM public.comms_threads
   WHERE kind = 'project' AND project_id = p_project_id
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_thread IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  INSERT INTO public.comms_threads (kind, project_id, created_by)
    VALUES ('project', p_project_id, v_caller)
    RETURNING id INTO v_thread;

  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role) VALUES
    (v_thread, v_designer_id, 'designer'),
    (v_thread, v_client_id,   'client');

  -- System message: thread opened.
  INSERT INTO public.comms_messages (thread_id, sender_id, body, system)
    VALUES (v_thread, NULL, 'Project conversation opened.', TRUE);

  RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_start_project_thread(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. rpc_start_vendor_brief(vendor, project, body)
--    Creates a vendor_brief thread (designer ↔ vendor), seeds a system
--    message describing the brief, and posts the designer's opening message
--    in one transaction.
--
--    The vendor profile may be a "pending placeholder" (PRD decision 1) —
--    no auth user exists yet; the row exists in profiles with role='vendor'.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_start_vendor_brief(
  p_vendor_id  UUID,
  p_project_id UUID,
  p_body       TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_thread UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'rpc_start_vendor_brief requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_vendor_id IS NULL OR p_vendor_id = v_caller THEN
    RAISE EXCEPTION 'vendor must be a different profile than the caller'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'opening brief body is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Caller must be a designer.
  IF public.comms_resolve_role(v_caller) <> 'designer' THEN
    RAISE EXCEPTION 'only designers may open a vendor brief'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.comms_threads (kind, project_id, created_by)
    VALUES ('vendor_brief', p_project_id, v_caller)
    RETURNING id INTO v_thread;

  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role) VALUES
    (v_thread, v_caller,     'designer'),
    (v_thread, p_vendor_id,  'vendor');

  -- System message: brief opened.
  INSERT INTO public.comms_messages (thread_id, sender_id, body, system)
    VALUES (
      v_thread,
      NULL,
      CASE
        WHEN p_project_id IS NOT NULL
          THEN 'Brief opened for project.'
        ELSE 'Brief opened.'
      END,
      TRUE
    );

  -- Designer's opening message.
  INSERT INTO public.comms_messages (thread_id, sender_id, body)
    VALUES (v_thread, v_caller, p_body);

  RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_start_vendor_brief(UUID, UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. rpc_mark_thread_read(thread_id)
--    Atomic mark-read: bumps the caller's last_read_at to now() if they're
--    a participant. No-op for non-participants (returns false rather than
--    raising, so optimistic clients can call it without error handling).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_mark_thread_read(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_rows   INT;
BEGIN
  IF v_caller IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.comms_thread_participants
     SET last_read_at = now()
   WHERE thread_id  = p_thread_id
     AND profile_id = v_caller
     AND left_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_thread_read(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. rpc_unread_summary()
--    Returns one row per thread the caller participates in, with the count
--    of messages newer than their last_read_at and excluding their own
--    sends. Drives the sidebar badge and per-thread unread dots.
--
--    Returned columns:
--      thread_id          UUID
--      kind               TEXT
--      project_id         UUID
--      last_message_at    TIMESTAMPTZ
--      unread_count       INT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_unread_summary()
RETURNS TABLE (
  thread_id        UUID,
  kind             TEXT,
  project_id       UUID,
  last_message_at  TIMESTAMPTZ,
  unread_count     INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id            AS thread_id,
    t.kind          AS kind,
    t.project_id    AS project_id,
    t.last_message_at,
    COALESCE((
      SELECT COUNT(*)::INT
        FROM public.comms_messages m
       WHERE m.thread_id = t.id
         AND m.created_at > p.last_read_at
         AND m.deleted_at IS NULL
         AND (m.sender_id IS NULL OR m.sender_id <> auth.uid())
    ), 0) AS unread_count
  FROM public.comms_thread_participants p
  JOIN public.comms_threads t ON t.id = p.thread_id
  WHERE p.profile_id = auth.uid()
    AND p.left_at IS NULL
    AND p.archived_at IS NULL
  ORDER BY t.last_message_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_unread_summary() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. rpc_soft_delete_message(message_id)
--    Sender soft-deletes their own message at any time (RLS update policy
--    blocks direct UPDATE after 15 min, so we channel deletes through this
--    SECURITY DEFINER RPC). Admins may soft-delete any message.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_soft_delete_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_sender UUID;
  v_rows   INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'rpc_soft_delete_message requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sender_id INTO v_sender
    FROM public.comms_messages
   WHERE id = p_message_id;

  IF v_sender IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_sender <> v_caller AND NOT public.is_comms_admin(v_caller) THEN
    RAISE EXCEPTION 'only the sender or an admin may delete this message'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.comms_messages
     SET deleted_at = now()
   WHERE id = p_message_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_soft_delete_message(UUID) TO authenticated;
