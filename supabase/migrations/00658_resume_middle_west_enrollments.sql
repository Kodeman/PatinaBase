-- ═══════════════════════════════════════════════════════════════════════════
-- 00658 — Resume the two Middle West Designer Onboarding enrollments
--
-- The Second House, Wave 2 (R-SH10). 00656 paused these two seats with
-- next_step_at pushed to 2026-10-15T15:00:00Z so Wave 1 could land without a
-- drip email firing. Deploy 2 is landing now — this resumes them, one full
-- tick forward from the deploy moment so no email fires on the deploy tick
-- itself. Mirrors 00656's shape exactly (same resolve-by-prefix predicate,
-- same idempotency guard, same step_history append discipline).
--
-- WHY status='active' + next_step_at PUSHED FORWARD:
--   the due predicate both send paths use is
--   .eq('status','active').lte('next_step_at', now()) (see 00656's header for
--   the exact call sites). Flipping status back to 'active' with next_step_at
--   left at the paused value (2026-10-15T15:00:00Z, already in the future
--   relative to Deploy 2) would already satisfy the predicate once that date
--   arrives, which is correct — but this migration also re-anchors
--   next_step_at to now() + 10 minutes so the resume takes its cue from the
--   actual resume moment (R-SH10), not from whatever date 00656 guessed
--   months ahead. Ten minutes clears the current processor tick (both send
--   paths run on a 5-minute cadence) so nothing fires on the deploy tick.
--
-- WHY THE ROWS ARE KEYED THE SAME WAY AS 00656:
--   same two seats, same evidence, same prefix predicate — see 00656's
--   header for the full justification (prod evidence keys these seats as
--   8-hex user_id prefixes, not enrollment-row uuids). The QA seat
--   (9ad7029e / user 86cdd0aa) is excluded by construction: its user_id
--   matches neither prefix, so it can never appear in the match set, and
--   the "exactly 2" assertion below fails loudly if the match set ever grew
--   to include a third row.
--
-- WHY status='paused' IS THE GUARD (not 'active'):
--   this migration only resumes rows 00656 actually paused. A rerun after a
--   successful resume finds the rows already 'active' and is a no-op — it
--   does not re-push next_step_at or append a second history entry.
--
-- Idempotent: the UPDATE only affects rows still 'paused', so a rerun is a
-- no-op. No DELETE. This ships in Deploy 2 only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  v_prefixes      text[] := ARRAY['19e7ae9b', '1a94f78f'];
  v_resume        timestamptz := now() + interval '10 minutes';
  v_sequence_name text := 'Designer Onboarding';
  v_ids           uuid[];
  v_found         int;
  v_resumed       int;
  v_ok            int;
BEGIN
  -- 1. Resolve the target rows from the recorded user_id prefixes, restricted
  --    to the Designer Onboarding sequence, same predicate as 00656.
  SELECT array_agg(e.id), count(*)
    INTO v_ids, v_found
  FROM public.sequence_enrollments e
  JOIN public.automated_sequences s ON s.id = e.sequence_id
  WHERE s.name = v_sequence_name
    AND EXISTS (
      SELECT 1 FROM unnest(v_prefixes) AS p
      WHERE e.user_id::text LIKE p || '%'
    );

  -- A fresh/local DB has zero sequence_enrollments rows — legitimate no-op,
  -- not an error; prod carries exactly these two rows, so any other count is
  -- still refused loudly.
  IF v_found = 0 THEN
    RAISE NOTICE
      '00658: no Designer Onboarding enrollments found for the Middle West seats (%) — no-op (fresh/local DB).',
      array_to_string(v_prefixes, ', ');
    RETURN;
  ELSIF v_found <> 2 THEN
    RAISE EXCEPTION
      '00658: expected exactly 2 enrollments for the Middle West seats (%), found % — refusing to guess.',
      array_to_string(v_prefixes, ', '), v_found;
  END IF;

  -- 2. Resume. current_step is untouched; step_history is appended to.
  UPDATE public.sequence_enrollments e
     SET status       = 'active',
         next_step_at = v_resume,
         step_history = e.step_history || jsonb_build_object(
           'migration',  '00658',
           'action',     'resumed',
           'note',       'resumed after The Second House Deploy 2 (R-SH10); one full tick forward so no email fires on the deploy tick',
           'from_status', e.status,
           'prev_next_step_at', e.next_step_at,
           'current_step', e.current_step,
           'resumed_at', now()
         )
   WHERE e.id = ANY(v_ids)
     AND e.status = 'paused';

  GET DIAGNOSTICS v_resumed = ROW_COUNT;

  -- 3. Post-assert the end state, whether this run changed anything or not.
  SELECT count(*) INTO v_ok
  FROM public.sequence_enrollments e
  WHERE e.id = ANY(v_ids)
    AND e.status = 'active';

  IF v_ok <> 2 THEN
    RAISE EXCEPTION
      '00658: after the update only % of 2 target enrollments are active — aborting.',
      v_ok;
  END IF;

  RAISE NOTICE '00658: % enrollment(s) flipped paused->active this run; both Middle West seats are active.',
    v_resumed;
END
$mig$;
