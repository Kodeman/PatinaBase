-- ═══════════════════════════════════════════════════════════════════════════
-- 00614 — time-nudges: the hourly running-timer sweep, and the dark opt-in
--
-- HT-34 ruled two things at once, and this migration ships only one of them:
--
--   (a) A running timer over 8 hours writes ONE quiet Record row (the Post's
--       Record page, R82) — no push, no email, no SMS. This is live: the
--       cron below fires the `time-nudges` edge function hourly with
--       {"rule":"running_timer"}, on the `00572:1221-1225` hourly-schedule
--       shape (preceded by the same guarded-unschedule idiom, 00572:1216-1219,
--       so a re-run of this migration never leaves a duplicate job).
--
--   (b) An opt-in, per-member, weekly-at-most "you haven't logged a day"
--       reminder — ruled dark by default (P-5: no flags anywhere; the cron
--       entry itself is the off switch). This migration buys ONLY the column
--       the opted-in check will read (`profiles.weekly_hours_reminder_opt_in`,
--       defaulting to false — nobody is opted in until a future wave ships a
--       settings surface that writes it) and leaves the weekly cron.schedule
--       call as an inert SQL comment below. No `cron.job` row for it is ever
--       created here, so rule (b) cannot fire in prod no matter how the
--       edge function's own logic reads.
--
-- No new table, no new RLS, no new definer-rights function — the only
-- executable schema change is the ADD COLUMN. `public.invoke_edge_function`
-- (00258) already carries its own REVOKE/GRANT and is not touched here.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (b)'s dark column — defaults to false; no writer ships until it's ruled ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_hours_reminder_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.weekly_hours_reminder_opt_in IS
  '00614/HT-34(b): opt-in for the weekly unlogged-day reminder. Defaults to '
  'false and has no portal writer yet (built dark, per P-5) — the only path '
  'that can ever flip it today is a direct SQL update. The cron that would '
  'read it is deliberately never scheduled (see the commented block below).';

-- ── (a) — the one live cron: an hourly sweep for stale running timers ──────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'time-nudges-hourly') THEN
    PERFORM cron.unschedule('time-nudges-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'time-nudges-hourly',
  '0 * * * *',
  $$SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb);$$
);

-- ── (b) — NOT scheduled. Left as an inert comment (HT-34 / P-5: "behind a ──
-- flag that ships off" is satisfied here by never creating the cron.job row,
-- not by a PostHog flag). Uncommenting this block is itself the ship
-- decision for the weekly reminder — do not uncomment it without a fresh
-- ruling superseding HT-34(b) as recorded 2026-09-11.
--
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'time-nudges-weekly') THEN
--     PERFORM cron.unschedule('time-nudges-weekly');
--   END IF;
-- END $$;
--
-- SELECT cron.schedule(
--   'time-nudges-weekly',
--   '0 14 * * 1', -- Monday 14:00 UTC, matching the hourly-release pattern
--                 -- 00572 uses for "Monday 8am local" (recipient-side gate
--                 -- lives in the edge function, not the cron expression)
--   $$SELECT public.invoke_edge_function('time-nudges', '{"rule":"weekly_unlogged"}'::jsonb);$$
-- );
