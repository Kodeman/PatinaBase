-- ═══════════════════════════════════════════════════════════════════════════
-- 00656 — Pause the two Middle West Designer Onboarding enrollments
--
-- The Second House, Wave 1 (R-SH3 authorizes; R-SH10 sets the resume). Both
-- live Middle West seats have a drip step due 2026-09-25; Wave 1 must land
-- before it fires. This pauses them and pushes the due time past the window.
--
-- WHY status='paused' STOPS THE SEND (verified, both send paths):
--   supabase/functions/automation-processor/index.ts:710-715 and
--   packages/notifications/src/automation-engine.ts:684-689 both select due
--   enrollments with .eq('status','active').lte('next_step_at', now) — so a
--   non-'active' status is not picked up at all. sequence_enrollments.status
--   is plain TEXT with no enum/CHECK (00044_campaigns.sql:table def), and
--   00561's own remap block already treats 'paused' as a live-cursor status
--   (00561:112-116, "status IN ('active','paused')"), so the value is
--   expected here rather than invented.
--
-- WHY next_step_at IS ALSO PUSHED FORWARD (required, not belt-and-braces):
--   the due predicate is next_step_at <= now(). Both rows currently sit at
--   2026-09-25. If only status were flipped, then the moment R-SH10 flips it
--   back to 'active' the row is already overdue and one email goes out on
--   the next 5-minute tick. Pushing to 2026-10-15 15:00Z means the resume
--   has a full tick of headroom.
--
-- WHY A STATUS FLIP DOES NOT REWRITE STEPS (verified):
--   the only trigger on sequence_enrollments is
--   set_sequence_enrollments_updated_at (00044_campaigns.sql:135), an
--   extensions.moddatetime(updated_at) BEFORE UPDATE. There is no trigger
--   that touches current_step or steps_json. 00561's step remap is one-shot
--   migration code, not a trigger, so it cannot re-fire here. current_step
--   is left exactly as found; step_history is APPENDED to, never rewritten
--   (00561:104-108 set that precedent — a migration records its own
--   per-enrollment action as a step_history entry so the change is
--   auditable on the row).
--
-- WHY THE ROWS ARE KEYED ON user_id PREFIX:
--   the prod evidence records these seats only as 8-hex prefixes of
--   user_id — artifacts/studio-hook-2026-09-22/research/03-prod-evidence.md
--   §3.2 renders `substr(e.user_id::text,1,8)`, NOT sequence_enrollments.id.
--   Full uuids for the enrollment rows appear nowhere in the evidence, and
--   this migration must not invent one. Prefix matching is made safe by
--   asserting the match set is exactly the two expected seats, and by
--   refusing to run if the QA seat is in it.
--
-- THE QA SEAT IS EXCLUDED BY CONSTRUCTION, AND IS DELIBERATELY NOT NAMED HERE.
--   The third live enrollment (patina.cloud, step 13, due 2026-09-28) belongs to
--   a seat whose user_id matches NEITHER prefix above, so the prefix predicate
--   cannot select it and the "exactly 2" assertion would fail loudly if the
--   match set ever grew to include it. Naming its id in this file would only
--   add a redundant check while putting a seat we must never write to into the
--   text of a migration that writes -- so it is left out on purpose. The
--   transactional test for this migration does seed that third seat and asserts
--   it comes through untouched.
--
-- Idempotent: the UPDATE only affects rows still 'active', so a rerun is a
-- no-op and appends no second history entry. No DELETE. Resume is a separate
-- migration in Deploy 2 (R-SH10), not a rollback of this one.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  v_prefixes text[] := ARRAY['19e7ae9b', '1a94f78f'];
  v_resume   timestamptz := '2026-10-15T15:00:00Z';
  v_ids      uuid[];
  v_found    int;
  v_paused   int;
  v_ok       int;
BEGIN
  -- 1. Resolve the target rows from the recorded user_id prefixes. Any status,
  --    so the count assertion holds on a rerun too.
  SELECT array_agg(e.id), count(*)
    INTO v_ids, v_found
  FROM public.sequence_enrollments e
  WHERE EXISTS (
    SELECT 1 FROM unnest(v_prefixes) AS p
    WHERE e.user_id::text LIKE p || '%'
  );

  IF v_found IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      '00656: expected exactly 2 enrollments for the Middle West seats (%), found % — refusing to guess.',
      array_to_string(v_prefixes, ', '), COALESCE(v_found, 0);
  END IF;

  -- 2. Pause. current_step is untouched; step_history is appended to.
  UPDATE public.sequence_enrollments e
     SET status       = 'paused',
         next_step_at = v_resume,
         step_history = e.step_history || jsonb_build_object(
           'migration',  '00656',
           'action',     'paused',
           'note',       'paused for The Second House Wave 1; resume after Deploy 2 (R-SH10)',
           'from_status', e.status,
           'prev_next_step_at', e.next_step_at,
           'current_step', e.current_step,
           'paused_at',  now()
         )
   WHERE e.id = ANY(v_ids)
     AND e.status = 'active';

  GET DIAGNOSTICS v_paused = ROW_COUNT;

  -- 3. Post-assert the end state, whether this run changed anything or not.
  SELECT count(*) INTO v_ok
  FROM public.sequence_enrollments e
  WHERE e.id = ANY(v_ids)
    AND e.status = 'paused'
    AND e.next_step_at = v_resume;

  IF v_ok <> 2 THEN
    RAISE EXCEPTION
      '00656: after the update only % of 2 target enrollments are paused with next_step_at = % — aborting.',
      v_ok, v_resume;
  END IF;

  RAISE NOTICE '00656: % enrollment(s) flipped active->paused this run; both Middle West seats are paused with next_step_at = %.',
    v_paused, v_resume;
END
$mig$;
