-- ═══════════════════════════════════════════════════════════════════════════
-- 00742 — Room hand-backs: READY FOR LEAH
--         (US-21 slice 3, W4; D18, ruling Q13; T-34, SQ-640)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00742" (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md); direction.md D18 and Q13.
--
-- New objects only. No CREATE OR REPLACE base: nothing existing is rewritten.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W4
-- reset owner, T-38, does it; CONTRACT §4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_room_handbacks
--   Append-only. One row per hand-back act: the first hire hands a room back
--   to Leah for review (READY FOR LEAH). It records an internal review fact,
--   who and when, and nothing else. A room may be handed back more than once;
--   each act is its own row.
--
-- hand_back_project_room(p_project_room_id uuid) RETURNS jsonb
--   Inserts one row for the room's project and returns {handedBackAt}.
--   It NEVER touches project_ffe_items: no disposition, no select, no
--   release. A room with placeholders can be handed back and they stay
--   placeholders (Q13). It sends nothing. Client payloads never read it.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- SELECT TO authenticated USING can_buy_for_project(project_id) (00702:60).
-- No client policy: a client JWT reads 0 rows. INSERT, UPDATE and DELETE are
-- revoked from authenticated and anon; the only writer is
-- hand_back_project_room (SECURITY DEFINER, gate _ffe_require_studio_project,
-- 00717:75). service_role gets SELECT and INSERT only (append-only).
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_room_handbacks ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_room_handbacks (
  id              uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_room_id uuid        NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  handed_back_by  uuid        NOT NULL REFERENCES public.profiles(id),
  handed_back_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_room_handbacks_project
  ON public.project_room_handbacks (project_id, handed_back_at);
CREATE INDEX IF NOT EXISTS idx_project_room_handbacks_room
  ON public.project_room_handbacks (project_room_id, handed_back_at);

COMMENT ON TABLE public.project_room_handbacks IS
  'Append-only internal review fact: a room handed back to the lead designer, READY FOR LEAH '
  '(00742, D18, Q13). Who and when, nothing else; never read by client payloads. '
  'Read: can_buy_for_project. Written only through hand_back_project_room.';

ALTER TABLE public.project_room_handbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_room_handbacks_studio_select ON public.project_room_handbacks;
CREATE POLICY project_room_handbacks_studio_select ON public.project_room_handbacks
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.project_room_handbacks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_room_handbacks TO authenticated;
GRANT SELECT, INSERT ON TABLE public.project_room_handbacks TO service_role;

-- ─── 2. hand_back_project_room ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hand_back_project_room(p_project_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project_id uuid;
  v_at         timestamptz;
BEGIN
  SELECT room.project_id INTO v_project_id
  FROM public.project_rooms room
  WHERE room.id = p_project_room_id;

  -- An unknown room leaves v_project_id NULL, which the gate refuses with the
  -- same 'project not found or access denied' as a room the caller cannot
  -- reach, so existence never leaks.
  PERFORM public._ffe_require_studio_project(v_project_id);

  INSERT INTO public.project_room_handbacks (project_id, project_room_id, handed_back_by)
  VALUES (v_project_id, p_project_room_id, auth.uid())
  RETURNING handed_back_at INTO v_at;

  RETURN jsonb_build_object('handedBackAt', v_at);
END;
$$;

COMMENT ON FUNCTION public.hand_back_project_room(uuid) IS
  'READY FOR LEAH (00742, D18, Q13): records that the caller handed this room back for review and '
  'returns {handedBackAt}. Studio only (_ffe_require_studio_project). Never writes project_ffe_items: '
  'no disposition, no select, no release. Sends nothing.';

REVOKE ALL ON FUNCTION public.hand_back_project_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hand_back_project_room(uuid) TO authenticated;
