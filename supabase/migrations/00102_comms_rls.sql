-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: In-App Messaging — RLS Policies
-- Spec: docs/prds/in-app-messaging-prd.md §13
-- Description:
--   Authorization is participant-based. A user can read a thread iff they
--   are an active (left_at IS NULL) participant on it; admins read all.
--   Writes are gated by participation + sender_id = auth.uid().
--
--   Edits to one's own message are allowed within 15 minutes of creation
--   (decision (3) in the resolved-questions table of the PRD). Deletes are
--   self-only with no time limit (sender soft-deletes by setting deleted_at
--   via the RPC; this policy permits the underlying UPDATE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Helper: is_comms_admin(uid)
--    Centralizes the "is this user an admin?" check used by audit policies.
--    Mirrors the existing user_roles pattern from 00024_designer_applications.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_comms_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id
       AND r.domain = 'admin'
  )
  OR EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_user_id
       AND p.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_comms_admin IS
  'True if the user has the admin role via either the user_roles join or the legacy profiles.role column. Used by comms_* RLS for read-only audit access.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Helper: is_thread_participant(thread, uid)
--    Most read policies need this; inlined as a function for clarity and to
--    avoid policy duplication.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_comms_thread_participant(p_thread_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.comms_thread_participants p
     WHERE p.thread_id  = p_thread_id
       AND p.profile_id = p_user_id
       AND p.left_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_comms_thread_participant IS
  'True if the user is an active (not left) participant on the thread. SECURITY DEFINER so it can be called from RLS policies on related tables.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. comms_threads policies
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS comms_threads_select ON public.comms_threads;
CREATE POLICY comms_threads_select
  ON public.comms_threads FOR SELECT
  TO authenticated
  USING (
    public.is_comms_thread_participant(id, auth.uid())
    OR public.is_comms_admin(auth.uid())
  );

-- Anyone authenticated can create a thread, but they must list themselves
-- as the creator. Cardinality and participant validity are enforced by the
-- triggers in 00101 and the participant insert policy below.
DROP POLICY IF EXISTS comms_threads_insert ON public.comms_threads;
CREATE POLICY comms_threads_insert
  ON public.comms_threads FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Updates to a thread (title edits, metadata) only by participants or admins.
DROP POLICY IF EXISTS comms_threads_update ON public.comms_threads;
CREATE POLICY comms_threads_update
  ON public.comms_threads FOR UPDATE
  TO authenticated
  USING (
    public.is_comms_thread_participant(id, auth.uid())
    OR public.is_comms_admin(auth.uid())
  )
  WITH CHECK (
    public.is_comms_thread_participant(id, auth.uid())
    OR public.is_comms_admin(auth.uid())
  );

-- Threads are not deletable from client roles. Admin-only.
DROP POLICY IF EXISTS comms_threads_delete ON public.comms_threads;
CREATE POLICY comms_threads_delete
  ON public.comms_threads FOR DELETE
  TO authenticated
  USING (public.is_comms_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. comms_thread_participants policies
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS comms_participants_select ON public.comms_thread_participants;
CREATE POLICY comms_participants_select
  ON public.comms_thread_participants FOR SELECT
  TO authenticated
  USING (
    public.is_comms_thread_participant(thread_id, auth.uid())
    OR public.is_comms_admin(auth.uid())
  );

-- Participant insert rules:
--  • The thread creator can seed any participants for a thread they created
--    (this covers the create-thread RPC flow within a single transaction).
--  • An existing participant on the thread can add another participant
--    (designer adding a vendor mid-project).
--  • Admins can always add.
DROP POLICY IF EXISTS comms_participants_insert ON public.comms_thread_participants;
CREATE POLICY comms_participants_insert
  ON public.comms_thread_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_comms_admin(auth.uid())
    OR public.is_comms_thread_participant(thread_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.comms_threads t
       WHERE t.id = thread_id AND t.created_by = auth.uid()
    )
  );

-- Participants update only their own row (mark-read, archive, mute, prefs).
-- Admins may update any row.
DROP POLICY IF EXISTS comms_participants_update_own ON public.comms_thread_participants;
CREATE POLICY comms_participants_update_own
  ON public.comms_thread_participants FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_comms_admin(auth.uid()))
  WITH CHECK (profile_id = auth.uid() OR public.is_comms_admin(auth.uid()));

-- Removing a participant: the row owner can leave (set left_at via RPC, or
-- delete in degenerate cases); admins can remove anyone.
DROP POLICY IF EXISTS comms_participants_delete ON public.comms_thread_participants;
CREATE POLICY comms_participants_delete
  ON public.comms_thread_participants FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_comms_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. comms_messages policies
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: any active participant on the thread, plus admins.
-- Soft-deleted messages remain readable so the audit trail survives, but the
-- API layer / hooks blank the body before returning to non-admin clients.
DROP POLICY IF EXISTS comms_messages_select ON public.comms_messages;
CREATE POLICY comms_messages_select
  ON public.comms_messages FOR SELECT
  TO authenticated
  USING (
    public.is_comms_thread_participant(thread_id, auth.uid())
    OR public.is_comms_admin(auth.uid())
  );

-- Insert: must be a participant; sender_id must be the calling user except
-- for system messages (sender_id IS NULL, system = true), which are emitted
-- via SECURITY DEFINER RPCs only — RLS still rejects direct user writes of
-- system messages because participants cannot bypass the check below.
DROP POLICY IF EXISTS comms_messages_insert ON public.comms_messages;
CREATE POLICY comms_messages_insert
  ON public.comms_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT system
    AND sender_id = auth.uid()
    AND public.is_comms_thread_participant(thread_id, auth.uid())
  );

-- Edit own message within 15 minutes of creation (PRD decision 3).
-- Admins can update any message (e.g., for legal redaction).
DROP POLICY IF EXISTS comms_messages_update_own ON public.comms_messages;
CREATE POLICY comms_messages_update_own
  ON public.comms_messages FOR UPDATE
  TO authenticated
  USING (
    (sender_id = auth.uid() AND created_at > now() - interval '15 minutes')
    OR public.is_comms_admin(auth.uid())
  )
  WITH CHECK (
    (sender_id = auth.uid() AND created_at > now() - interval '15 minutes')
    OR public.is_comms_admin(auth.uid())
  );

-- Delete: prefer soft-delete via UPDATE (deleted_at). Hard delete is admin-only
-- to preserve audit trail.
DROP POLICY IF EXISTS comms_messages_delete ON public.comms_messages;
CREATE POLICY comms_messages_delete
  ON public.comms_messages FOR DELETE
  TO authenticated
  USING (public.is_comms_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. comms_quick_replies policies
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS comms_quick_replies_select_own ON public.comms_quick_replies;
CREATE POLICY comms_quick_replies_select_own
  ON public.comms_quick_replies FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS comms_quick_replies_insert_own ON public.comms_quick_replies;
CREATE POLICY comms_quick_replies_insert_own
  ON public.comms_quick_replies FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS comms_quick_replies_update_own ON public.comms_quick_replies;
CREATE POLICY comms_quick_replies_update_own
  ON public.comms_quick_replies FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS comms_quick_replies_delete_own ON public.comms_quick_replies;
CREATE POLICY comms_quick_replies_delete_own
  ON public.comms_quick_replies FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());
