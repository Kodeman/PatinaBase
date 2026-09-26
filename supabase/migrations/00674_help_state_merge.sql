-- =====================================================================================
-- 00674 — help_state_merge: a two-level merge into the caller's own
--         profiles.help_state (SQ-265 Phase 0, story US-13, W1-c)
--
-- Design of record: artifacts/return-teaching-2026-09-25/design/system-architecture.md
-- finding F2. Every help_state writer today overwrites the whole column, and the tour
-- cache hydrates as {tours, featureAnnouncements} only, so a Desk Walkthrough step
-- erases marginNotes and firstAuthoredAt. This function lets a writer send only the
-- top-level keys it owns, and every other key already stored is kept. For a key in
-- the patch, when both the stored value and the patch value are JSON objects the
-- result is stored->key || patch->key (so a cache that writes {tours:{y}} before it
-- has hydrated does not erase a stored tours.x, SQ-294 R1 finding 9); otherwise the
-- patch value replaces the key whole. A second-level entry is replaced whole, and a
-- second-level JSON null deletes that entry ({"tours":{"walk":null}} removes
-- tours.walk, which is how a tour restart clears its record). Nulls deeper inside an
-- entry are kept.
--
-- What this adds, all new objects; nothing installed is redefined:
--   `public.help_state_merge(p_patch jsonb) RETURNS jsonb`, SECURITY DEFINER, pinned
--   to auth.uid(). Refuses (22023) a patch that is not a JSON object, has a top-level
--   key outside tours | featureAnnouncements | marginNotes | firstAuthoredAt, or is
--   over 16384 bytes. Locks the caller's profiles row FOR UPDATE, takes as the base
--   the stored help_state if it is a JSON object, else '{}', folds each patch key
--   onto it as above, and returns the result. A stored non-object (array, string,
--   JSON null) is replaced, not concatenated: `||` on an array appends the patch as
--   an element, so the column would turn into an array and grow on every write.
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
  v_base   jsonb;
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

  SELECT CASE WHEN jsonb_typeof(p.help_state) = 'object' THEN p.help_state ELSE '{}'::jsonb END
    INTO v_base
    FROM public.profiles p
   WHERE p.id = v_uid
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'help_state_merge: no profile for caller' USING ERRCODE = 'P0002';
  END IF;

  -- An object patch value is merged onto the stored value (or onto '{}' when the
  -- stored value is not an object), and a second-level entry whose merged value is
  -- JSON null is dropped: {"tours":{"walk":null}} deletes tours.walk. Only that
  -- level is filtered; nulls deeper inside an entry (completedAt: null) are kept.
  SELECT v_base || COALESCE(jsonb_object_agg(e.key, lvl.merged), '{}'::jsonb)
    INTO v_result
    FROM jsonb_each(p_patch) AS e(key, value)
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN jsonb_typeof(e.value) = 'object' THEN (
                 SELECT COALESCE(jsonb_object_agg(m.key, m.value), '{}'::jsonb)
                   FROM jsonb_each(
                          CASE WHEN jsonb_typeof(v_base -> e.key) = 'object'
                               THEN v_base -> e.key ELSE '{}'::jsonb END
                          || e.value
                        ) AS m(key, value)
                  WHERE m.value <> 'null'::jsonb)
               ELSE e.value
             END AS merged
    ) AS lvl;

  UPDATE public.profiles SET help_state = v_result WHERE id = v_uid;

  RETURN v_result;
END
$$;

COMMENT ON FUNCTION public.help_state_merge(jsonb) IS
  'Two-level merge into the caller''s own profiles.help_state (00674, SQ-265). '
  'Stored keys absent from p_patch are kept. For a key in p_patch, when both the '
  'stored and the patch value are objects the result is stored || patch for that '
  'key; otherwise the patch value replaces it. In an object patch value, an entry '
  'set to JSON null deletes that entry. '
  'A stored help_state that is not a JSON object is replaced by the patch. '
  'Allowed keys: tours, featureAnnouncements, marginNotes, firstAuthoredAt. A '
  'non-object patch, any other key, or a patch over 16384 bytes raises 22023. '
  'Returns the resulting help_state.';

REVOKE ALL ON FUNCTION public.help_state_merge(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.help_state_merge(jsonb) TO authenticated;
