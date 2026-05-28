-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00164: populate user_sessions from auth.sessions (SET-10)
--
-- user_sessions (00162) was never populated, so the profile "Active Sessions"
-- list only ever showed the current session. Mirror auth.sessions into
-- public.user_sessions via an AFTER INSERT trigger, and FK with ON DELETE
-- CASCADE so a row disappears when the auth session ends (logout/expiry).
--
-- SAFETY: the trigger body is wrapped in an exception handler — a logging
-- failure must NEVER block authentication.
-- ═══════════════════════════════════════════════════════════════════════════

-- Link user_sessions rows 1:1 to auth.sessions; CASCADE keeps the list accurate.
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS auth_session_id UUID
    REFERENCES auth.sessions(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_auth_session
  ON public.user_sessions(auth_session_id) WHERE auth_session_id IS NOT NULL;

-- Insert-on-login trigger (exception-guarded; SECURITY DEFINER to bypass RLS).
CREATE OR REPLACE FUNCTION public.record_user_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_sessions
      (user_id, auth_session_id, user_agent, ip, created_at, last_active_at)
    VALUES
      (NEW.user_id, NEW.id, NEW.user_agent, host(NEW.ip), NEW.created_at, NOW())
    ON CONFLICT (auth_session_id) WHERE auth_session_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the auth transaction because of session logging.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.record_user_session();

-- Backfill currently-active auth sessions so the list is populated immediately.
INSERT INTO public.user_sessions
  (user_id, auth_session_id, user_agent, ip, created_at, last_active_at)
SELECT s.user_id, s.id, s.user_agent, host(s.ip), s.created_at, COALESCE(s.updated_at, s.created_at)
FROM auth.sessions s
ON CONFLICT (auth_session_id) WHERE auth_session_id IS NOT NULL DO NOTHING;
