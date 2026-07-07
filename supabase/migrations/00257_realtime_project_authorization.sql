-- =============================================================================
-- 00257 — Realtime authorization for project + user broadcast channels
-- =============================================================================
-- The projects service moved from a Socket.io gateway to Supabase Realtime
-- broadcast channels (see services/projects/src/realtime/). It publishes events
-- with the service-role key to two private topic families:
--   * project:<uuid>  — every event for a project (all viewers)
--   * user:<uuid>     — direct notifications to a single user
--
-- Server sends set `private: true`, and a private broadcast only reaches private
-- channels, so these events are never delivered to a public subscriber. This
-- migration adds the RLS on realtime.messages that decides who may JOIN those
-- private channels (receive broadcasts, track presence):
--   * project:<uuid> → the lead designer, the client, or an active team member,
--     reusing the exact ownership model from 00168 / is_project_team_member (00087).
--   * user:<uuid>    → only that user.
--
-- Global "Allow public access" can stay ON: existing public channels (comms
-- typing presence, postgres_changes) are unaffected because our channels are
-- private end-to-end.
-- =============================================================================

-- Membership check for a realtime topic. SECURITY DEFINER so an authenticated
-- caller can resolve project membership without direct grants on the table.
CREATE OR REPLACE FUNCTION public.realtime_project_access(topic text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  kind text;
  ref  text;
  pid  uuid;
BEGIN
  IF topic IS NULL THEN
    RETURN false;
  END IF;

  kind := split_part(topic, ':', 1);
  ref  := split_part(topic, ':', 2);

  IF kind = 'user' THEN
    RETURN ref = auth.uid()::text;
  ELSIF kind = 'project' THEN
    BEGIN
      pid := ref::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = pid
        AND (
          p.designer_id = auth.uid()
          OR p.client_id = auth.uid()
          OR public.is_project_team_member(p.id)
        )
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_project_access(text) TO authenticated;

-- RLS policies on realtime.messages (Supabase's authorization table for
-- broadcast + presence on private channels). Guarded so the migration is a
-- no-op on an instance where the realtime schema is not present.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages not found — skipping realtime RLS policies';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Project members can receive realtime" ON realtime.messages;
  DROP POLICY IF EXISTS "Project members can send realtime presence" ON realtime.messages;

  -- Receive broadcasts + presence on an authorized private topic.
  CREATE POLICY "Project members can receive realtime"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      extension IN ('broadcast', 'presence')
      AND public.realtime_project_access((SELECT realtime.topic()))
    );

  -- Track presence (and any client-originated broadcast) on an authorized topic.
  -- The server publishes with the service-role key, which bypasses RLS.
  CREATE POLICY "Project members can send realtime presence"
    ON realtime.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
      extension IN ('broadcast', 'presence')
      AND public.realtime_project_access((SELECT realtime.topic()))
    );
END $$;
