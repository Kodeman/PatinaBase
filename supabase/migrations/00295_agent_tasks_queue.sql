-- ═══════════════════════════════════════════════════════════════════════════
-- 00295 — Agent OS: agent_tasks queue core
--
-- The foundational agent task queue. One durable outbox (public.agent_tasks)
-- that every Agent OS surface enqueues into, claims from, completes, and
-- routes to human review through. Replaces the single-purpose
-- public.cowork_tasks queue (00076), whose rows are data-migrated and frozen
-- in the sibling migration 00296.
--
-- Modelled on the Aesthete jobs queue (00241): FOR UPDATE SKIP LOCKED claim,
-- exponential backoff (1m/5m/25m keyed on attempts, park at attempts>=max),
-- idempotency-key ON CONFLICT dedupe, SECURITY DEFINER + SET search_path,
-- REVOKE-then-GRANT lockdown. Admin-domain RLS SELECT idiom from 00076.
--
-- State machine (enforced THREE ways — CHECK constraint, the BEFORE UPDATE OF
-- status trigger enforce_agent_task_transition(), and the DEFINER RPCs being
-- the only granted write path):
--   queued          -> running | cancelled
--   running         -> done | awaiting_review | queued | failed | cancelled | running
--   awaiting_review -> approved | rejected | cancelled
--   failed          -> queued
--   done/approved/rejected/cancelled -> terminal (no transitions out)
-- (running->running permits stale-lock reclaim; running->queued is the
-- backoff retry; failed->queued is requeue/groom.)
--
-- The 'resurrect' on-conflict path in enqueue_agent_task legitimately re-opens
-- a terminal row (done/cancelled/rejected) back to queued; it authorises that
-- single transition through a transaction-local GUC (app.transition_override)
-- that the trigger honours ONLY for terminal->queued. Every other write —
-- direct, external, or from any other RPC — is still fully governed by the
-- trigger, so a raw UPDATE that jumps the machine still raises.
--
-- Grants: agent_reader/agent_writer roles do NOT exist yet (a later brief
-- mints them in a follow-up migration); this migration grants execute only to
-- service_role, and table SELECT to authenticated (admin-domain RLS gates it).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. agent_tasks — the queue ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type          text NOT NULL,                         -- open set; validated in the data layer, deliberately no CHECK
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','awaiting_review','approved','rejected','done','failed','cancelled')),
  priority           int  NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),   -- 1 = highest
  source             text NOT NULL DEFAULT 'manual',
  assignee           text CHECK (assignee IS NULL OR assignee IN ('kody','leah')),
  entity_type        text,
  entity_id          uuid,                                  -- generic linkage
  summary            text NOT NULL DEFAULT '',
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence         numeric(3,2) CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),
  review_state       jsonb,                                 -- written ONLY by review_agent_task
  idempotency_key    text UNIQUE,
  attempts           int  NOT NULL DEFAULT 0,
  max_attempts       int  NOT NULL DEFAULT 5,
  run_after          timestamptz NOT NULL DEFAULT now(),
  last_error         text,
  locked_by          text,
  locked_at          timestamptz,
  flagged_stale_at   timestamptz,
  awaiting_review_at timestamptz,
  parent_task_id     uuid REFERENCES public.agent_tasks(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_claim
  ON public.agent_tasks (priority, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_running
  ON public.agent_tasks (locked_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_review
  ON public.agent_tasks (assignee, priority, created_at) WHERE status = 'awaiting_review';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_entity
  ON public.agent_tasks (entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type
  ON public.agent_tasks (task_type, created_at DESC);

COMMENT ON TABLE public.agent_tasks IS
  'Agent OS task queue (00295). One durable outbox: surfaces enqueue via enqueue_agent_task, workers claim via claim_agent_tasks (FOR UPDATE SKIP LOCKED), complete via complete_agent_task, humans decide via review_agent_task. Writes only through the SECURITY DEFINER RPCs (or service_role). Supersedes cowork_tasks (00076/00296).';

-- ─── 2. agent_task_audit — append-only history ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_task_audit (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id  uuid NOT NULL,
  op       text NOT NULL,
  old_row  jsonb,
  new_row  jsonb,
  actor    text NOT NULL,
  txid     bigint NOT NULL DEFAULT txid_current(),
  at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_task_audit_task ON public.agent_task_audit (task_id, at);

COMMENT ON TABLE public.agent_task_audit IS
  'Append-only audit of every agent_tasks INSERT/UPDATE/DELETE (00295). actor comes from the app.actor GUC the RPCs stamp (falling back to auth.uid()/session_user).';

-- ─── 3. Maintenance + state-machine + audit triggers ────────────────────────

-- updated_at maintenance (00076 idiom).
CREATE OR REPLACE FUNCTION public.agent_tasks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_tasks_updated_at ON public.agent_tasks;
CREATE TRIGGER trg_agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.agent_tasks_set_updated_at();

-- State-machine enforcement. Fires only when an UPDATE names the status column.
-- Raises 'agent_tasks: illegal transition % -> %' on any pair not in the list.
CREATE OR REPLACE FUNCTION public.enforce_agent_task_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ok boolean;
BEGIN
  -- Self-loops: only running->running is a legal reclaim; every other
  -- status=old-status write (e.g. done->done) is inert and blocked.
  IF NEW.status = OLD.status THEN
    IF OLD.status = 'running' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Authorised resurrect (enqueue_agent_task, p_on_conflict='resurrect'):
  -- re-open a terminal/failed row to queued. Narrowly scoped — the GUC only
  -- unlocks terminal->queued, nothing else.
  IF current_setting('app.transition_override', true) = 'resurrect'
     AND NEW.status = 'queued'
     AND OLD.status IN ('done','failed','cancelled','rejected') THEN
    RETURN NEW;
  END IF;

  v_ok := CASE OLD.status
    WHEN 'queued'          THEN NEW.status IN ('running','cancelled')
    WHEN 'running'         THEN NEW.status IN ('done','awaiting_review','queued','failed','cancelled','running')
    WHEN 'awaiting_review' THEN NEW.status IN ('approved','rejected','cancelled')
    WHEN 'failed'          THEN NEW.status IN ('queued')
    ELSE false   -- done/approved/rejected/cancelled: terminal
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'agent_tasks: illegal transition % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_tasks_transition ON public.agent_tasks;
CREATE TRIGGER trg_agent_tasks_transition
  BEFORE UPDATE OF status ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_task_transition();

-- Audit every mutation. SECURITY DEFINER so it writes regardless of the
-- caller's grants; actor from the app.actor GUC the RPCs set.
CREATE OR REPLACE FUNCTION public.agent_task_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor text;
BEGIN
  v_actor := COALESCE(NULLIF(current_setting('app.actor', true), ''), auth.uid()::text, session_user::text);
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.agent_task_audit (task_id, op, old_row, new_row, actor)
    VALUES (OLD.id, TG_OP, to_jsonb(OLD), NULL, v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.agent_task_audit (task_id, op, old_row, new_row, actor)
    VALUES (NEW.id, TG_OP, NULL, to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSE
    INSERT INTO public.agent_task_audit (task_id, op, old_row, new_row, actor)
    VALUES (NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_tasks_audit ON public.agent_tasks;
CREATE TRIGGER trg_agent_tasks_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.agent_task_audit_trigger();

-- ─── 4. RLS — admin-domain reads; writes via DEFINER RPCs / service_role ─────
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tasks_select_admin ON public.agent_tasks;
CREATE POLICY agent_tasks_select_admin
  ON public.agent_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS agent_task_audit_select_admin ON public.agent_task_audit;
CREATE POLICY agent_task_audit_select_admin
  ON public.agent_task_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies: writes go through the SECURITY DEFINER
-- RPCs below and service-role edge workers, both of which bypass RLS.
GRANT SELECT ON public.agent_tasks      TO authenticated;
GRANT SELECT ON public.agent_task_audit TO authenticated;

-- ─── 5. RPCs — the only granted write path (service_role only) ───────────────

-- 5.1 enqueue_agent_task — land a task; exactly-once via idempotency_key.
CREATE OR REPLACE FUNCTION public.enqueue_agent_task(
  p_task_type      text,
  p_payload        jsonb       DEFAULT '{}'::jsonb,
  p_source         text        DEFAULT 'manual',
  p_priority       int         DEFAULT 3,
  p_assignee       text        DEFAULT NULL,
  p_entity_type    text        DEFAULT NULL,
  p_entity_id      uuid        DEFAULT NULL,
  p_idempotency_key text       DEFAULT NULL,
  p_run_after      timestamptz DEFAULT now(),
  p_max_attempts   int         DEFAULT 5,
  p_on_conflict    text        DEFAULT 'ignore',
  p_summary        text        DEFAULT '',
  p_status         text        DEFAULT 'queued',
  p_parent_task_id uuid        DEFAULT NULL,
  p_confidence     numeric     DEFAULT NULL,
  p_artifacts      jsonb       DEFAULT '{}'::jsonb,
  p_actor          text        DEFAULT NULL
)
RETURNS public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.agent_tasks;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  IF p_status NOT IN ('queued','awaiting_review') THEN
    RAISE EXCEPTION 'enqueue_agent_task: p_status must be queued or awaiting_review, got %', p_status;
  END IF;
  IF p_on_conflict NOT IN ('ignore','resurrect') THEN
    RAISE EXCEPTION 'enqueue_agent_task: p_on_conflict must be ignore or resurrect, got %', p_on_conflict;
  END IF;

  IF p_on_conflict = 'resurrect' THEN
    PERFORM set_config('app.transition_override', 'resurrect', true);
    INSERT INTO public.agent_tasks (
      task_type, status, priority, source, assignee, entity_type, entity_id,
      summary, payload, artifacts, confidence, idempotency_key, max_attempts,
      run_after, parent_task_id, awaiting_review_at
    ) VALUES (
      p_task_type, p_status, p_priority, p_source, p_assignee, p_entity_type, p_entity_id,
      p_summary, coalesce(p_payload,'{}'::jsonb), coalesce(p_artifacts,'{}'::jsonb), p_confidence,
      p_idempotency_key, p_max_attempts, p_run_after, p_parent_task_id,
      CASE WHEN p_status = 'awaiting_review' THEN now() END
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'queued', attempts = 0, run_after = now(),
          last_error = NULL, locked_by = NULL, locked_at = NULL, completed_at = NULL,
          updated_at = now()
      WHERE public.agent_tasks.status IN ('done','failed','cancelled','rejected')
    RETURNING * INTO v_row;
    PERFORM set_config('app.transition_override', '', true);

    IF v_row.id IS NULL THEN
      -- conflict on a live (non-terminal) row: WHERE excluded the update; return unchanged
      SELECT * INTO v_row FROM public.agent_tasks WHERE idempotency_key = p_idempotency_key;
    END IF;
  ELSE
    -- 'ignore': exactly-once — return the existing row untouched on conflict
    INSERT INTO public.agent_tasks (
      task_type, status, priority, source, assignee, entity_type, entity_id,
      summary, payload, artifacts, confidence, idempotency_key, max_attempts,
      run_after, parent_task_id, awaiting_review_at
    ) VALUES (
      p_task_type, p_status, p_priority, p_source, p_assignee, p_entity_type, p_entity_id,
      p_summary, coalesce(p_payload,'{}'::jsonb), coalesce(p_artifacts,'{}'::jsonb), p_confidence,
      p_idempotency_key, p_max_attempts, p_run_after, p_parent_task_id,
      CASE WHEN p_status = 'awaiting_review' THEN now() END
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row FROM public.agent_tasks WHERE idempotency_key = p_idempotency_key;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- 5.2 claim_agent_tasks — atomically lease queued (and stale-running) tasks.
CREATE OR REPLACE FUNCTION public.claim_agent_tasks(
  p_task_types        text[],
  p_batch             int,
  p_worker            text,
  p_visibility_timeout interval DEFAULT '15 minutes'
)
RETURNS SETOF public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.actor', coalesce(p_worker, auth.uid()::text, session_user::text), true);

  RETURN QUERY
  UPDATE public.agent_tasks t
     SET status     = 'running',
         locked_by  = p_worker,
         locked_at  = now(),
         attempts   = t.attempts + 1,
         started_at = coalesce(t.started_at, now())
   WHERE t.id IN (
     SELECT j.id
       FROM public.agent_tasks j
      WHERE (
              (j.status = 'queued'  AND j.run_after <= now())
              OR
              (j.status = 'running' AND j.locked_at < now() - p_visibility_timeout)
            )
        AND (p_task_types IS NULL OR j.task_type = ANY(p_task_types))
      ORDER BY j.priority, j.created_at
      LIMIT GREATEST(p_batch, 0)
        FOR UPDATE SKIP LOCKED
   )
  RETURNING t.*;
END;
$$;

-- 5.3 complete_agent_task — a worker reports a claimed task's outcome.
CREATE OR REPLACE FUNCTION public.complete_agent_task(
  p_id        uuid,
  p_outcome   text,
  p_artifacts jsonb   DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_error     text    DEFAULT NULL,
  p_fatal     boolean DEFAULT false,
  p_actor     text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  IF p_outcome NOT IN ('done','awaiting_review','failed') THEN
    RAISE EXCEPTION 'complete_agent_task: p_outcome must be done, awaiting_review or failed, got %', p_outcome;
  END IF;

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_agent_task: task % not found', p_id;
  END IF;
  IF v_task.status <> 'running' THEN
    RAISE EXCEPTION 'complete_agent_task: task % is % (must be running)', p_id, v_task.status;
  END IF;

  IF p_outcome = 'done' THEN
    UPDATE public.agent_tasks SET
      status       = 'done',
      artifacts    = artifacts || coalesce(p_artifacts, '{}'::jsonb),
      confidence   = coalesce(p_confidence, confidence),
      last_error   = coalesce(p_error, last_error),
      completed_at = now(),
      locked_by    = NULL,
      locked_at    = NULL
     WHERE id = p_id;

  ELSIF p_outcome = 'awaiting_review' THEN
    UPDATE public.agent_tasks SET
      status             = 'awaiting_review',
      awaiting_review_at = now(),
      artifacts          = artifacts || coalesce(p_artifacts, '{}'::jsonb),
      confidence         = coalesce(p_confidence, confidence),
      last_error         = coalesce(p_error, last_error),
      locked_by          = NULL,
      locked_at          = NULL
     WHERE id = p_id;

  ELSE
    -- 'failed'
    IF p_fatal OR v_task.attempts >= v_task.max_attempts THEN
      UPDATE public.agent_tasks SET
        status       = 'failed',
        artifacts    = artifacts || coalesce(p_artifacts, '{}'::jsonb),
        confidence   = coalesce(p_confidence, confidence),
        last_error   = coalesce(p_error, last_error),
        completed_at = now(),
        locked_by    = NULL,
        locked_at    = NULL
       WHERE id = p_id;
    ELSE
      UPDATE public.agent_tasks SET
        status     = 'queued',
        artifacts  = artifacts || coalesce(p_artifacts, '{}'::jsonb),
        confidence = coalesce(p_confidence, confidence),
        last_error = coalesce(p_error, last_error),
        run_after  = now() + (CASE
                       WHEN v_task.attempts <= 1 THEN interval '1 minute'
                       WHEN v_task.attempts = 2  THEN interval '5 minutes'
                       ELSE                           interval '25 minutes'
                     END),
        locked_by  = NULL,
        locked_at  = NULL
       WHERE id = p_id;
    END IF;
  END IF;
END;
$$;

-- 5.4 review_agent_task — a human approves/rejects an awaiting_review task.
CREATE OR REPLACE FUNCTION public.review_agent_task(
  p_id           uuid,
  p_decision     text,
  p_reviewer     text,
  p_note         text  DEFAULT NULL,
  p_payload_patch jsonb DEFAULT NULL,
  p_review_meta  jsonb  DEFAULT NULL
)
RETURNS public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
  v_row  public.agent_tasks;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_reviewer, auth.uid()::text, session_user::text), true);

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'review_agent_task: p_decision must be approved or rejected, got %', p_decision;
  END IF;

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_agent_task: task % not found', p_id;
  END IF;
  IF v_task.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'review_agent_task: task % is % (must be awaiting_review)', p_id, v_task.status;
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'review_agent_task: a rejection requires p_note';
  END IF;

  UPDATE public.agent_tasks SET
    status = p_decision,
    payload = CASE
                WHEN p_decision = 'rejected'      THEN payload || jsonb_build_object('feedback', p_note)
                WHEN p_payload_patch IS NOT NULL  THEN payload || p_payload_patch
                ELSE payload
              END,
    review_state = jsonb_build_object(
                     'reviewer',   p_reviewer,
                     'decision',   p_decision,
                     'note',       p_note,
                     'meta',       p_review_meta,
                     'decided_at', now()
                   ),
    completed_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 5.5 requeue_agent_task — groom a parked failed task back to queued.
CREATE OR REPLACE FUNCTION public.requeue_agent_task(
  p_id       uuid,
  p_actor    text,
  p_feedback text DEFAULT NULL
)
RETURNS public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
  v_row  public.agent_tasks;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requeue_agent_task: task % not found', p_id;
  END IF;
  IF v_task.status <> 'failed' THEN
    RAISE EXCEPTION 'requeue_agent_task: task % is % (only failed may be requeued)', p_id, v_task.status;
  END IF;

  UPDATE public.agent_tasks SET
    status       = 'queued',
    attempts     = 0,
    run_after    = now(),
    locked_by    = NULL,
    locked_at    = NULL,
    last_error   = NULL,
    completed_at = NULL,
    payload      = CASE WHEN p_feedback IS NOT NULL
                        THEN payload || jsonb_build_object('feedback', p_feedback)
                        ELSE payload END
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 5.6 cancel_agent_task — cancel a live task. Reason lands in last_error.
CREATE OR REPLACE FUNCTION public.cancel_agent_task(
  p_id     uuid,
  p_actor  text,
  p_reason text DEFAULT NULL
)
RETURNS public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
  v_row  public.agent_tasks;
BEGIN
  PERFORM set_config('app.actor', coalesce(p_actor, auth.uid()::text, session_user::text), true);

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_agent_task: task % not found', p_id;
  END IF;
  IF v_task.status NOT IN ('queued','running','awaiting_review') THEN
    RAISE EXCEPTION 'cancel_agent_task: task % is % (only queued/running/awaiting_review may be cancelled)', p_id, v_task.status;
  END IF;

  UPDATE public.agent_tasks SET
    status       = 'cancelled',
    completed_at = now(),
    locked_by    = NULL,
    locked_at    = NULL,
    last_error   = coalesce(p_reason, last_error)   -- cancellation reason recorded in last_error
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 5.7 agent_queue_stats — counts + oldest per status (read-only; no actor).
CREATE OR REPLACE FUNCTION public.agent_queue_stats()
RETURNS TABLE(status text, task_count bigint, oldest_created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.status, count(*)::bigint AS task_count, min(t.created_at) AS oldest_created_at
    FROM public.agent_tasks t
   GROUP BY t.status
   ORDER BY t.status;
$$;

-- ─── 6. Grants — service_role executes; nobody else ─────────────────────────
REVOKE ALL ON FUNCTION public.enqueue_agent_task(text, jsonb, text, int, text, text, uuid, text, timestamptz, int, text, text, text, uuid, numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_tasks(text[], int, text, interval)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agent_task(uuid, text, jsonb, numeric, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_agent_task(uuid, text, text, text, jsonb, jsonb)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_agent_task(uuid, text, text)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_agent_task(uuid, text, text)                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_queue_stats()                                           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_task(text, jsonb, text, int, text, text, uuid, text, timestamptz, int, text, text, text, uuid, numeric, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_tasks(text[], int, text, interval)               TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agent_task(uuid, text, jsonb, numeric, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_agent_task(uuid, text, text, text, jsonb, jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_agent_task(uuid, text, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_agent_task(uuid, text, text)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_queue_stats()                                           TO service_role;
