-- ═══════════════════════════════════════════════════════════════════════════
-- 00298 — Agent OS: cowork_tasks → agent_tasks bridge
--
-- Data-migrates every public.cowork_tasks row (00076) into the new
-- public.agent_tasks queue (00297), preserving id, then FREEZES cowork_tasks
-- so nothing writes to the old queue again. cowork_tasks remains a readable
-- archive.
--
-- Status map: pending->queued, picked_up->running, running->running,
--             completed->done, failed->failed, cancelled->cancelled.
-- vendor_id -> (entity_type='pipeline_vendor', entity_id).
-- input_payload -> payload (+ payload.recurrence when the row was recurring).
-- artifacts = { output: output_payload, files: output_files }.
-- retry_count->attempts, max_retries->max_attempts, error_message->last_error,
-- picked_up_at->started_at; created_at/completed_at preserved.
-- source='cowork:legacy'; idempotency_key='cowork:'||id (⇒ re-runnable).
--
-- Plain INSERT (not enqueue_agent_task): the migration runs as superuser and
-- must land historical statuses (running/done/failed/…) verbatim. The
-- state-machine trigger is UPDATE-only, so an INSERT with any legal status
-- value is untouched by it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Data migration (idempotent via ON CONFLICT (idempotency_key)) ───────
INSERT INTO public.agent_tasks (
  id, task_type, status, source,
  entity_type, entity_id,
  payload, artifacts,
  attempts, max_attempts, last_error,
  started_at, created_at, completed_at,
  idempotency_key
)
SELECT
  ct.id,
  ct.task_type,
  CASE ct.status
    WHEN 'pending'   THEN 'queued'
    WHEN 'picked_up' THEN 'running'
    WHEN 'running'   THEN 'running'
    WHEN 'completed' THEN 'done'
    WHEN 'failed'    THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'queued'
  END,
  'cowork:legacy',
  CASE WHEN ct.vendor_id IS NOT NULL THEN 'pipeline_vendor' END,
  ct.vendor_id,
  coalesce(ct.input_payload, '{}'::jsonb)
    || CASE
         WHEN ct.is_recurring OR ct.cron_expression IS NOT NULL
         THEN jsonb_build_object('recurrence', jsonb_build_object(
                'is_recurring',    ct.is_recurring,
                'cron_expression', ct.cron_expression,
                'last_run_at',     ct.last_run_at,
                'next_run_at',     ct.next_run_at))
         ELSE '{}'::jsonb
       END,
  jsonb_build_object('output', coalesce(ct.output_payload, '{}'::jsonb),
                     'files',  to_jsonb(ct.output_files)),
  coalesce(ct.retry_count, 0),
  coalesce(ct.max_retries, 5),
  ct.error_message,
  ct.picked_up_at,
  ct.created_at,
  ct.completed_at,
  'cowork:' || ct.id::text
FROM public.cowork_tasks ct
ON CONFLICT (idempotency_key) DO NOTHING;

-- ─── 2. Freeze cowork_tasks — reads OK, writes rejected ─────────────────────
CREATE OR REPLACE FUNCTION public.cowork_tasks_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cowork_tasks is frozen (00298) — use agent_tasks';
END;
$$;

DROP TRIGGER IF EXISTS trg_cowork_tasks_frozen ON public.cowork_tasks;
CREATE TRIGGER trg_cowork_tasks_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.cowork_tasks
  FOR EACH ROW EXECUTE FUNCTION public.cowork_tasks_frozen();

COMMENT ON TABLE public.cowork_tasks IS
  'FROZEN 2026-07-12 (00298). Superseded by public.agent_tasks (00297); all rows were data-migrated there (idempotency_key = ''cowork:''||id, source=''cowork:legacy''). A BEFORE INSERT/UPDATE/DELETE trigger rejects all writes — this table is a read-only archive. Enqueue new work via enqueue_agent_task.';
