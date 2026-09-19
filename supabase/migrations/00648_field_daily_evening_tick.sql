-- ═══════════════════════════════════════════════════════════════════════════
-- 00648 — The evening tick, so the site card can fire
-- Lineage: 00284 scheduled 'field-daily' at 13:00 UTC; 00432 moved it to
-- 14:00 UTC (08:00 CST / 09:00 CDT) to keep it inside the delivery window.
-- 00645 then gave field-daily two more things to say — the site card the
-- EVENING BEFORE a visit (due at 17:00 local, FIELD_TZ) and the ask the
-- MORNING OF (due 07:30 local) — and a once-a-day cron cannot say both.
--
-- THE GAP THIS CLOSES. 14:00 UTC is 08:00 or 09:00 in America/Chicago and
-- never 17:00, so on the single morning tick the site card's floor
-- (SITE_CARD_LOCAL_MINUTES, field-daily/core.ts:54) is never reached: at
-- phase 1 the evening card would simply never be sent. The morning ask is
-- already fine on the existing tick (08:00/09:00 local both clear the 07:30
-- floor), so the morning job's name, schedule and command are unchanged.
--
-- ─── The shape, and why ────────────────────────────────────────────────────
-- Two shapes were on the table: (a) a SECOND job at a fixed UTC hour that is
-- past 17:00 local in both daylight-saving states, or (b) an HOURLY
-- 'field-daily' with the local-minute gates in core.ts deciding what each tick
-- issues. This migration takes (a), because (b) is not idempotent within a
-- LOCAL day and the fix for that lives in code this migration may not touch:
--
--   The daily digest keys its send claim on the UTC date — dedupeKey
--   `field-daily:<party>:<isoDate(now)>` and the matching digest_day on the
--   conversation context (field-daily/core.ts:400, :460, :554). The UTC date
--   rolls over at 18:00 CST / 19:00 CDT, which is still the same LOCAL
--   evening and still inside the 08:00–20:00 quiet-hours window. An hourly
--   tick at 00:00–01:00 UTC therefore computes a FRESH dedupe key for a local
--   day that has already had its digest, and the rail's only suppression for
--   that send (the unique send claim on dedupe_key, _shared/sms.ts:1605,1746)
--   cannot see the duplicate. The crew gets a second numbered menu at seven in
--   the evening. Proven in supabase/functions/_tests/field-daily.test.ts
--   ("an hourly tick issues a SECOND daily digest in the same local evening").
--   Making (b) safe means keying the digest on the local day in core.ts, which
--   is out of this migration's scope.
--
-- ─── Why 23:05 UTC ─────────────────────────────────────────────────────────
-- FIELD_TZ stays the single source of the zone: this file names no zone and
-- does no zone arithmetic. It only has to pick a UTC instant that is past the
-- card's local floor at BOTH offsets the rail's zone currently takes. For
-- America/Chicago (UTC-6 standard, UTC-5 daylight) 23:05 UTC is 17:05 CST and
-- 18:05 CDT: past the 17:00 floor in both states, and comfortably short of the
-- 20:00 local quiet-hours ceiling in both, so the card goes on the wire that
-- evening instead of being deferred to the morning it is meant to precede.
-- The five minutes are margin, not decoration: the floor is a `>=` on the
-- local minute, and a tick that lands one minute short does not retry — the
-- next tick is the following morning, by which time the visit has started.
-- If FIELD_TZ is ever set to a zone where 23:05 UTC is outside 17:00–20:00
-- local, this expression is what has to change.
--
-- ─── The job registry, after this migration ────────────────────────────────
--   field-daily          '0 14 * * *'   08:00 CST / 09:00 CDT — digest,
--                                        delivery confirms, the day-of ask
--   field-daily-evening  '5 23 * * *'   17:05 CST / 18:05 CDT — the site card
--
-- Both invoke the SAME edge function with the SAME empty payload: which of
-- its blocks does anything is decided by the local-minute gates inside
-- core.ts, not by the caller. Everything the second tick re-enters is
-- idempotent per UTC day (the digest's dedupe key and frozen menu) or per
-- subject (delivery confirms by event id, cards by
-- `field-<kind>:<party>:<day>`), so the evening tick re-walking the morning's
-- work sends nothing twice.
--
-- Re-runnable, following 00432: unschedule-if-exists inside a DO block that
-- swallows the "no such job" error, then schedule. BOTH jobs are declared here
-- so that replaying this one file restores the whole field-daily registry —
-- the same thing 00432 did to 00284's job. cron.schedule re-declares the job
-- under the role running the migration, as 00432 already did.
-- NO grants: cron.schedule/cron.unschedule carry their own, and this file adds
-- no object of its own, so supabase/seed/00-legacy-grants.sql is untouched.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM cron.unschedule('field-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled on this database yet
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('field-daily-evening');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- first install, or a re-run after a manual unschedule
END;
$$;

-- The morning tick: unchanged from 00432, re-declared so this file alone
-- describes the registry.
SELECT cron.schedule(
  'field-daily',
  '0 14 * * *',
  $$SELECT public.invoke_edge_function('field-daily', '{}'::jsonb);$$
);

-- The evening tick: the site card the evening before a site visit.
SELECT cron.schedule(
  'field-daily-evening',
  '5 23 * * *',
  $$SELECT public.invoke_edge_function('field-daily', '{}'::jsonb);$$
);
