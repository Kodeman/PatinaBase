-- ═══════════════════════════════════════════════════════════════════════════
-- 00378 — Agent task completion lease ownership
--
-- Lineage: 00297 complete_agent_task (latest and only prior definition).
-- The 00297 body is repeated in full; the only behavior grafts are the
-- fail-closed non-empty p_actor check and the exact locked_by = p_actor check.
--
-- Hazard reconciled: after a visibility timeout, worker B can reclaim a task
-- that worker A is still processing. The 00297 completion RPC checked only
-- status='running', so late worker A could complete B's live lease. Completion
-- now requires the caller's collision-resistant lease-owner identity to equal
-- locked_by. The RPC remains service_role-only; service_role is trusted and a
-- unique identity per claim invocation is the expected-owner contract.
-- ═══════════════════════════════════════════════════════════════════════════

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
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'complete_agent_task: p_actor must be non-empty';
  END IF;
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
  IF v_task.locked_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION
      'complete_agent_task: lease ownership rejected for task % (locked_by %, p_actor %)',
      p_id, coalesce(v_task.locked_by, '<none>'), p_actor;
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

REVOKE ALL ON FUNCTION public.complete_agent_task(uuid, text, jsonb, numeric, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_agent_task(uuid, text, jsonb, numeric, text, boolean, text) TO service_role;
