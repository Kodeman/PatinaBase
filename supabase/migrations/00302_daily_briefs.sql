-- ═══════════════════════════════════════════════════════════════════════════
-- 00302 — Agent OS: daily_briefs (WP-1.3 Morning Brief job)
--
-- One row per Chicago calendar date, written by the morning-brief edge
-- function (invoked nightly via pg_cron -> invoke_edge_function, 00258
-- bridge). content jsonb carries the composed digest: queue counts, prior
-- day's job runs, marketplace-vitals deltas (when WP-1.2's
-- get_marketplace_vitals RPC exists — omitted otherwise), exceptions (stale /
-- failed / intake_error agent_tasks), and "today's three" highest-priority
-- awaiting_review items.
--
-- brief_date is the PRIMARY KEY (not a surrogate id) so a same-day re-run is
-- a natural UPSERT ... ON CONFLICT (brief_date) — the edge function excludes
-- email_sent_at from its update payload so a regenerate never clobbers the
-- "already emailed today" watermark (PostgREST upsert only SETs the columns
-- present in the request body on the UPDATE branch).
--
-- RLS: admin-domain SELECT idiom straight from 00300's job_runs (same
-- user_roles/roles domain='admin' EXISTS check). No INSERT/UPDATE/DELETE
-- policies — the edge function writes via the service-role client, which
-- bypasses RLS entirely; this table has no SECURITY DEFINER RPC because its
-- only writer is trusted server-side code, not an agent or a browser caller.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. daily_briefs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_briefs (
  brief_date     date PRIMARY KEY,
  content        jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  email_sent_at  timestamptz
);

COMMENT ON TABLE public.daily_briefs IS
  'Agent OS (00302): one row per Chicago calendar date, the Morning Brief edge function''s composed digest (queue/runs_yesterday/vitals/exceptions/todays_three). brief_date is the natural key; re-running the job for the same date UPSERTs content + generated_at but preserves email_sent_at.';

ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_briefs_select_admin ON public.daily_briefs;
CREATE POLICY daily_briefs_select_admin
  ON public.daily_briefs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy: the morning-brief edge function writes with
-- the service-role client (bypasses RLS). GRANT SELECT lets the admin-portal
-- session client read the row directly if it ever needs to (today the API
-- route reads via the service-role adminClient, per the 00297 idiom, but the
-- grant costs nothing and matches job_runs/agent_tasks precedent).
GRANT SELECT ON public.daily_briefs TO authenticated;

-- ─── 2. Guarded cron — 11:00 UTC daily ──────────────────────────────────────
-- 11:00 UTC = 6:00 AM CDT / 5:00 AM CST -> the brief is always ready by 6:00
-- AM Central regardless of DST (per WP-1.3 acceptance: "brief waiting by
-- 6:00 AM Central... pick 11:00 UTC and accept the hour shift"). Single
-- schedule, no DST-aware cron gymnastics.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-brief-daily') THEN
    PERFORM cron.unschedule('morning-brief-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'morning-brief-daily',
  '0 11 * * *',
  $$
  SELECT public.invoke_edge_function('morning-brief', '{}'::jsonb);
  $$
);

-- Best-effort extension comment registry append (00300 idiom — pg_cron is
-- owned by supabase_admin on self-hosted, so a postgres-run migration may
-- lack privilege). Carried forward verbatim from 00300 plus this job; treat
-- as approximate, not authoritative — cron.job is the source of truth.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300 -> groom_agent_tasks: flags stale awaiting_review, requeues cooled-down failed tasks once, resets orphaned running tasks; run history in job_runs), morning-brief-daily (11:00 UTC daily, 00302 -> invoke_edge_function(''morning-brief''): composes the queue/runs/vitals/exceptions digest into daily_briefs, optional email to Kody; run history in job_runs). Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons, notification-digest-daily (00278), field-daily (00284).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
