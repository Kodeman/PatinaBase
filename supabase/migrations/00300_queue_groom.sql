-- ═══════════════════════════════════════════════════════════════════════════
-- 00300 — Agent OS: job_runs bookkeeping + queue-groom scheduled job
--
-- public.job_runs is a generic run-log for scheduled/background jobs (not
-- agent_tasks-specific — any future pg_cron job can INSERT/UPDATE its own
-- rows via its own SECURITY DEFINER function). This migration's only writer
-- is groom_agent_tasks().
--
-- groom_agent_tasks() runs every 6 hours via pg_cron and does three things to
-- public.agent_tasks (00297):
--   (a) flags awaiting_review tasks stale beyond p_stale_review — a direct
--       UPDATE of flagged_stale_at only, so the BEFORE UPDATE OF status
--       trigger does NOT fire (it isn't a status change), but the AFTER
--       trigger still audits it (actor = job:queue-groom).
--   (b) requeues 'failed' tasks whose cooldown has elapsed, EXACTLY ONCE per
--       task: calls requeue_agent_task (which is a legal failed->queued
--       transition per 00297's state machine and resets attempts/last_error)
--       then stamps payload.groom_requeued_at on the same row as a permanent
--       marker. requeue_agent_task's own payload write only touches a
--       'feedback' key (and only when p_feedback is passed, which groom does
--       not) so the marker this migration writes is the only thing guarding
--       against a second automatic requeue — it is never cleared by anything
--       else in the queue contract, so a task groom has requeued once will
--       never be auto-requeued again even if it fails again later.
--   (c) resets 'running' tasks whose lock is older than p_stale_running back
--       to 'queued' — running->queued is a legal transition; this is
--       belt-and-braces on top of claim_agent_tasks' own stale-lock reclaim
--       (00297 §5.2), for tasks no worker ever comes back to reclaim.
--
-- Concurrency: pg_try_advisory_xact_lock(hashtext('job:queue-groom')) makes a
-- second concurrent invocation a no-op (job_runs row status='skipped')
-- instead of double-running the groom pass. The lock is transaction-scoped
-- and releases when the calling statement's implicit transaction ends (cron
-- invokes this as a single top-level statement, so the lock is held only for
-- the duration of one groom run).
--
-- Grants: service_role only (same lockdown shape as every 00297 RPC).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. job_runs — generic scheduled-job run log ────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name     text NOT NULL,
  status       text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','succeeded','failed','skipped')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  cost_usd     numeric(8,2)
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name ON public.job_runs (job_name, started_at DESC);

COMMENT ON TABLE public.job_runs IS
  'Agent OS (00300): generic run log for scheduled/background jobs. groom_agent_tasks() is the only writer today; any future pg_cron job may adopt the same shape via its own SECURITY DEFINER function.';

-- RLS: admin-domain SELECT only (00297 idiom); writes go through
-- SECURITY DEFINER job functions / service_role, both of which bypass RLS —
-- no INSERT/UPDATE/DELETE policy or grant is added.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_runs_select_admin ON public.job_runs;
CREATE POLICY job_runs_select_admin
  ON public.job_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

GRANT SELECT ON public.job_runs TO authenticated;

-- ─── 2. groom_agent_tasks — the periodic queue-groom pass ───────────────────
CREATE OR REPLACE FUNCTION public.groom_agent_tasks(
  p_stale_review    interval DEFAULT '48 hours',
  p_stale_running   interval DEFAULT '1 hour',
  p_failed_cooldown interval DEFAULT '6 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id          bigint;
  v_stale_flagged   int := 0;
  v_failed_requeued int := 0;
  v_orphans_reset   int := 0;
  v_task_id         uuid;
  v_detail          jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:queue-groom')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('queue-groom', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:queue-groom', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('queue-groom', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- (a) Flag stale awaiting_review tasks. Not a status UPDATE — the
    -- transition trigger (BEFORE UPDATE OF status) does not fire; the audit
    -- trigger (AFTER, all columns) still records it.
    UPDATE public.agent_tasks
       SET flagged_stale_at = now()
     WHERE status = 'awaiting_review'
       AND awaiting_review_at < now() - p_stale_review
       AND flagged_stale_at IS NULL;
    GET DIAGNOSTICS v_stale_flagged = ROW_COUNT;

    -- (b) Requeue cooled-down failed tasks exactly once. requeue_agent_task
    -- resets attempts/last_error/completed_at and leaves payload untouched
    -- (no p_feedback passed); the marker written right after is what
    -- prevents a second automatic requeue on a later failure.
    FOR v_task_id IN
      SELECT id FROM public.agent_tasks
       WHERE status = 'failed'
         AND completed_at < now() - p_failed_cooldown
         AND payload ->> 'groom_requeued_at' IS NULL
    LOOP
      PERFORM public.requeue_agent_task(v_task_id, 'job:queue-groom');
      UPDATE public.agent_tasks
         SET payload = payload || jsonb_build_object('groom_requeued_at', now()::text)
       WHERE id = v_task_id;
      v_failed_requeued := v_failed_requeued + 1;
    END LOOP;

    -- (c) Reset orphaned running tasks. running->queued is trigger-legal;
    -- belt-and-braces on top of claim_agent_tasks' own stale-lock reclaim.
    UPDATE public.agent_tasks
       SET status = 'queued', locked_by = NULL, locked_at = NULL, run_after = now()
     WHERE status = 'running'
       AND locked_at < now() - p_stale_running;
    GET DIAGNOSTICS v_orphans_reset = ROW_COUNT;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object(
             'stale_flagged',   v_stale_flagged,
             'failed_requeued', v_failed_requeued,
             'orphans_reset',   v_orphans_reset
           )
     WHERE id = v_run_id;
    RAISE;
  END;

  v_detail := jsonb_build_object(
    'stale_flagged',   v_stale_flagged,
    'failed_requeued', v_failed_requeued,
    'orphans_reset',   v_orphans_reset
  );

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

REVOKE ALL ON FUNCTION public.groom_agent_tasks(interval, interval, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.groom_agent_tasks(interval, interval, interval) TO service_role;

-- ─── 3. pg_cron — every 6 hours, offset :23 past the hour ───────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-queue-groom') THEN
    PERFORM cron.unschedule('agent-queue-groom');
  END IF;
END $$;

SELECT cron.schedule(
  'agent-queue-groom',
  '23 */6 * * *',
  $$
  SELECT public.groom_agent_tasks();
  $$
);

-- Best-effort extension comment (00092/00189/00241/00250 idiom — pg_cron is
-- owned by supabase_admin on self-hosted, so a postgres-run migration may
-- lack privilege). Registry text carried forward from 00250, the last
-- migration to update it; 00278/00284 added crons without updating this
-- comment, so treat it as best-effort/approximate, not authoritative —
-- cron.job is the source of truth.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300 -> groom_agent_tasks: flags stale awaiting_review, requeues cooled-down failed tasks once, resets orphaned running tasks; run history in job_runs). Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons, notification-digest-daily (00278), field-daily (00284).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
