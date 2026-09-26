-- =====================================================================================
-- 00674 — help_state_merge: a top-level shallow merge into the caller's own
--         profiles.help_state (SQ-265 Phase 0, story US-13, W1-c)
--
-- Design of record: artifacts/return-teaching-2026-09-25/design/system-architecture.md
-- finding F2. Every help_state writer today overwrites the whole column, and the tour
-- cache hydrates as {tours, featureAnnouncements} only, so a Desk Walkthrough step
-- erases marginNotes and firstAuthoredAt. This function lets a writer send only the
-- top-level keys it owns: a key present in the patch replaces that key whole, and
-- every other key already stored is kept. Moving the writers onto it is separate work.
--
-- What this adds, all new objects; nothing installed is redefined:
--   `public.help_state_merge(p_patch jsonb) RETURNS jsonb`, SECURITY DEFINER, pinned
--   to auth.uid(). Refuses (22023) a patch that is not a JSON object, has a top-level
--   key outside tours | featureAnnouncements | marginNotes | firstAuthoredAt, or is
--   over 16384 bytes. Locks the caller's profiles row FOR UPDATE, sets
--   help_state = COALESCE(help_state, '{}') || p_patch, and returns the result.
--
-- Left untouched: the profiles.help_state column (shape: 00146) and every policy on
-- public.profiles.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.help_state_merge(jsonb);
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.help_state_merge(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
       WHERE k.key NOT IN ('tours', 'featureAnnouncements', 'marginNotes', 'firstAuthoredAt')
     )
     OR pg_column_size(p_patch) > 16384
  THEN
    RAISE EXCEPTION 'help_state_merge: patch refused' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'help_state_merge: no profile for caller' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
     SET help_state = COALESCE(help_state, '{}'::jsonb) || p_patch
   WHERE id = v_uid
  RETURNING help_state INTO v_result;

  RETURN v_result;
END
$$;

COMMENT ON FUNCTION public.help_state_merge(jsonb) IS
  'Top-level shallow merge into the caller''s own profiles.help_state (00674, SQ-265). '
  'A key present in p_patch replaces that key whole; other stored keys are kept. '
  'Allowed keys: tours, featureAnnouncements, marginNotes, firstAuthoredAt. A '
  'non-object patch, any other key, or a patch over 16384 bytes raises 22023. '
  'Returns the resulting help_state.';

REVOKE ALL ON FUNCTION public.help_state_merge(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.help_state_merge(jsonb) TO authenticated;
