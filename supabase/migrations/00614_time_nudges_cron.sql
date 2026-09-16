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
--       created here.
--
-- CORRECTED (round-1 review, D-R1-01): an earlier revision of this banner
-- claimed rule (b) "cannot fire in prod no matter how the edge function's
-- own logic reads" — that overstated it. Nothing here stops a caller who
-- holds ANY project-signed JWT (verify_jwt=true admits the publishable anon
-- key too) from POSTing {"rule":"weekly_unlogged"} directly to the deployed
-- function; the edge function's own code is what has to refuse that, and
-- until this round it did not. Three independent things now make rule (b)
-- inert, not one: no `cron.job` row is ever created for it (this file); the
-- opt-in column below defaults to false with no writer; and the edge
-- function itself now requires the platform's service-role credential
-- before rule (b) runs (supabase/functions/time-nudges/index.ts,
-- isServiceRoleCaller). This migration still buys none of that third layer
-- — it lives in the function, not the schema — named here so a future
-- reader does not repeat the overstated claim.
--
-- NARROWED (round-2 review, D-R2-01): the service-role check above gates
-- ONLY rule (b), not the hourly rule (a) this file schedules. The Vault
-- literal `invoke_edge_function` (00258) actually sends has never been
-- confirmed against any of isServiceRoleCaller's admitted shapes on Strata
-- — gating rule (a) on it too would risk silencing this cron invisibly
-- (this table's own job would still show 'succeeded'; only the edge
-- function's new `job_runs` bookkeeping, D-R2-06, would catch it). Rule (a)
-- runs ungated, matching the cron peers named above, none of which carry an
-- in-code caller check either.
--
-- Also new in this migration (D-R1-03): two partial UNIQUE indexes backing
-- the edge function's idempotency at the database layer, so a race between
-- two concurrent sweeps (trivially reachable once any caller can invoke the
-- function, not only the single-shot hourly cron) cannot produce two Record
-- rows for the same running timer or the same member-week. The edge
-- function's pre-check-then-insert stays as the fast path; a 23505 from
-- either index is treated as "already recorded", not an error.
--
-- No new table, no new RLS, no new definer-rights function — the only
-- executable schema changes are the ADD COLUMN and the two indexes below.
-- `public.invoke_edge_function` (00258) already carries its own REVOKE/GRANT
-- and is not touched here.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (b)'s dark column — defaults to false; no writer ships until it's ruled ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_hours_reminder_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.weekly_hours_reminder_opt_in IS
  '00614/HT-34(b): opt-in for the weekly unlogged-day reminder. Defaults to '
  'false and has no portal writer yet (built dark, per P-5) — the only path '
  'that can ever flip it today is a direct SQL update. The cron that would '
  'read it is deliberately never scheduled (see the commented block below).';

-- ── D-R1-03 — idempotency backed at the database layer, not just a query- ──
-- before-insert race. Same shape as 00431's
-- idx_notification_log_project_file_event: a partial UNIQUE expression index
-- keyed on the JSONB metadata field the edge function's pre-check already
-- reads. One row per (user, entry) for the running-timer nudge; one row per
-- (user, week) for the weekly-unlogged nudge (dark today, but wrong to leave
-- unindexed — the column check alone is not what makes it safe to turn on
-- later).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_log_time_entry_running_long
  ON public.notification_log (user_id, ((metadata ->> 'entry_id')))
  WHERE type = 'time_entry_running_long'
    AND channel = 'in_app';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_log_time_weekly_unlogged
  ON public.notification_log (user_id, ((metadata ->> 'week_key')))
  WHERE type = 'time_weekly_unlogged_reminder'
    AND channel = 'in_app';

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
