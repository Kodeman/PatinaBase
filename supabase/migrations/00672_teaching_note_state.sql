-- =====================================================================================
-- 00672 — teaching_note_state: a designer's own-row return-teaching state and its one
--         leaf-patch writer (Margin Notes, story US-13, W1-c)
--
-- Design of record: artifacts/return-teaching-2026-09-25/design/system-architecture.md
-- §1.3 and finding F2. Teaching state never goes through profiles.help_state:
-- can_view_profile (00555) exposes that column to counterparties, and help_state
-- writes clobber each other (SQ-265). This table is readable by its owner only.
--
-- What this adds, all new objects; nothing installed is redefined:
--   1. `public.teaching_note_state` (user_id PK → auth.users ON DELETE CASCADE,
--      state jsonb, updated_at). RLS on, four own-row policies to authenticated.
--      No other leg, no view, and no grant to anon, agent_reader or agent_writer.
--   2. `public.teaching_note_state_patch(p_path text[], p_value jsonb) RETURNS jsonb`,
--      SECURITY DEFINER, pinned to auth.uid(). It sets one leaf under a whitelisted
--      path (depth 1–3; `seen` paths are exactly seen.<key>.<n|first|last|out>),
--      refuses a value over 1024 bytes, creates missing parents instead of
--      no-opping, keeps a set `seen.<key>.out` terminal, and returns the resulting
--      state so the caller adopts it.
--
-- Left untouched: public.profiles, its help_state column and every profiles policy.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.teaching_note_state_patch(text[], jsonb);
--   DROP TABLE public.teaching_note_state;
-- =====================================================================================

-- ── 1. The table ────────────────────────────────────────────────────────────────────
-- Metadata only: note keys, counters, instants and outcomes. No copy text and no
-- project ids (§1.3 shape).
CREATE TABLE IF NOT EXISTS public.teaching_note_state (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teaching_note_state ENABLE ROW LEVEL SECURITY;

-- Own row only, for SELECT and every write.
DROP POLICY IF EXISTS teaching_note_state_select_own ON public.teaching_note_state;
CREATE POLICY teaching_note_state_select_own ON public.teaching_note_state
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS teaching_note_state_insert_own ON public.teaching_note_state;
CREATE POLICY teaching_note_state_insert_own ON public.teaching_note_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS teaching_note_state_update_own ON public.teaching_note_state;
CREATE POLICY teaching_note_state_update_own ON public.teaching_note_state
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS teaching_note_state_delete_own ON public.teaching_note_state;
CREATE POLICY teaching_note_state_delete_own ON public.teaching_note_state
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Post-flip, the policies above only bite with a matching table grant. anon and
-- the agent roles get nothing.
REVOKE ALL ON public.teaching_note_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teaching_note_state TO authenticated;
GRANT ALL ON public.teaching_note_state TO service_role;

COMMENT ON TABLE public.teaching_note_state IS
  'A designer''s return-teaching state (Margin Notes, 00672): release cursor, visit, '
  'unsolicited cap, quiet switch and per-note seen outcomes. Own row only; never '
  'stored in profiles.help_state, which counterparties can read. Writes go through '
  'teaching_note_state_patch.';

-- ── 2. The writer ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.teaching_note_state_patch(p_path text[], p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_state jsonb;
  i       int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL OR cardinality(p_path) NOT BETWEEN 1 AND 3
     OR p_path[1] NOT IN ('v', 'cursor', 'visit', 'recentUnsolicited', 'ignoredStreak', 'quiet', 'seen')
     OR (p_path[1] = 'seen' AND (cardinality(p_path) <> 3 OR p_path[3] NOT IN ('n', 'first', 'last', 'out')))
     OR pg_column_size(p_value) > 1024
  THEN
    RAISE EXCEPTION 'teaching_note_state_patch: path or value refused' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teaching_note_state (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT state INTO v_state FROM public.teaching_note_state WHERE user_id = v_uid FOR UPDATE;

  -- A terminal `out` is sticky: dismiss = forever, on every device.
  IF p_path[1] = 'seen' AND p_path[3] = 'out'
     AND v_state #>> ARRAY['seen', p_path[2], 'out'] IS NOT NULL THEN
    RETURN v_state;
  END IF;

  -- COALESCE each missing parent to '{}' so jsonb_set never no-ops.
  FOR i IN 1 .. cardinality(p_path) - 1 LOOP
    v_state := jsonb_set(v_state, p_path[1:i], COALESCE(v_state #> p_path[1:i], '{}'::jsonb), true);
  END LOOP;
  v_state := jsonb_set(v_state, p_path, p_value, true);

  UPDATE public.teaching_note_state SET state = v_state, updated_at = now() WHERE user_id = v_uid;
  RETURN v_state;
END
$$;

COMMENT ON FUNCTION public.teaching_note_state_patch(text[], jsonb) IS
  'Sets one leaf of the caller''s own teaching_note_state (00672) and returns the '
  'resulting state. Path depth 1-3, first segment in v | cursor | visit | '
  'recentUnsolicited | ignoredStreak | quiet | seen; a seen path is exactly '
  'seen.<key>.<n|first|last|out>. A value over 1024 bytes or any other path raises '
  '22023. Missing parents are created. A set seen.<key>.out is terminal: a later '
  'write to it returns the current state unchanged.';

REVOKE ALL ON FUNCTION public.teaching_note_state_patch(text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaching_note_state_patch(text[], jsonb) TO authenticated;
