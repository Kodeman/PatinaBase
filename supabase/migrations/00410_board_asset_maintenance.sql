-- ══════════════════════════════════════════════════════════════════════════
-- 00410 — Mood-board asset maintenance + durable URL-unfurl quota
--
-- The cleanup worker lands in a later edge-function slice. This migration
-- provides its durable candidate ledger, service-only job_runs bookends, and a
-- guarded daily pg_cron dispatch. The scheduled payload is dry-run=true and
-- carries the job_run_id; nothing in this migration deletes a storage object.
--
-- URL unfurl consumes a durable event under an advisory lock. The RPC enforces
-- a true rolling 10/user/10-minute limit and 100/user/UTC-day limit atomically;
-- rejected attempts do not consume quota.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Two-pass orphan candidate ledger ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.board_asset_gc_candidates (
  bucket_id text NOT NULL DEFAULT 'proposal-mood-boards'
    CHECK (bucket_id = 'proposal-mood-boards'),
  object_name text NOT NULL
    CHECK (length(btrim(object_name)) > 0 AND object_name LIKE '%/boards/%'),
  first_unreferenced_at timestamptz NOT NULL DEFAULT now(),
  last_scanned_at timestamptz NOT NULL DEFAULT now(),
  eligible_after timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  last_reference_count integer NOT NULL DEFAULT 0
    CHECK (last_reference_count >= 0),
  deleted_at timestamptz,
  last_job_run_id bigint REFERENCES public.job_runs(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_id, object_name),
  CHECK (eligible_after >= first_unreferenced_at + interval '14 days'),
  CHECK (deleted_at IS NULL OR deleted_at >= eligible_after)
);

CREATE INDEX IF NOT EXISTS idx_board_asset_gc_candidates_eligible
  ON public.board_asset_gc_candidates(eligible_after, first_unreferenced_at)
  WHERE deleted_at IS NULL AND last_reference_count = 0;

CREATE INDEX IF NOT EXISTS idx_board_asset_gc_candidates_job
  ON public.board_asset_gc_candidates(last_job_run_id)
  WHERE last_job_run_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_board_asset_gc_candidates
  ON public.board_asset_gc_candidates;
CREATE TRIGGER set_updated_at_board_asset_gc_candidates
BEFORE UPDATE ON public.board_asset_gc_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.board_asset_gc_candidates IS
  'Two-pass service-only orphan ledger for proposal-mood-boards. A future edge '
  'worker records first sight here and may delete only after eligible_after; '
  'the cron introduced with this table dispatches dry-run only.';

ALTER TABLE public.board_asset_gc_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_asset_gc_candidates
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.board_asset_gc_candidates TO service_role;

-- ── 2. Durable unfurl events + atomic quota consumer ──────────────────────────

CREATE TABLE IF NOT EXISTS public.board_unfurl_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_unfurl_usage_user_time
  ON public.board_unfurl_usage(user_id, consumed_at DESC);

COMMENT ON TABLE public.board_unfurl_usage IS
  'Durable accepted URL-unfurl events. consume_board_unfurl_quota serializes '
  'per user and enforces 10 rolling/10 minutes plus 100/UTC day.';

ALTER TABLE public.board_unfurl_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_unfurl_usage
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.board_unfurl_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.board_unfurl_usage_id_seq
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_board_unfurl_quota(
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_claim_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt()->>'role'
  );
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz;
  v_day_reset timestamptz;
  v_short_count integer;
  v_day_count integer;
  v_retry_after integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unfurl user is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A user-token caller can consume only its own quota. A service-role edge
  -- caller has no auth.uid() and must name the verified user explicitly.
  IF v_actor_id IS NOT NULL AND v_user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'cannot consume another user''s unfurl quota'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_actor_id IS NULL
     AND v_claim_role IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'service role required when user context is absent'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Exact concurrency boundary: every counter check+insert for one user is
  -- serialized inside the calling transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('board-unfurl:' || v_user_id::text, 0)
  );

  v_day_start := (
    date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  );
  v_day_reset := (
    (date_trunc('day', v_now AT TIME ZONE 'UTC') + interval '1 day')
      AT TIME ZONE 'UTC'
  );

  -- Opportunistic per-user retention. Keep enough history for a rolling window
  -- that crosses UTC midnight while preventing unbounded quota-table growth.
  DELETE FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at < v_now - interval '25 hours';

  SELECT count(*)::integer,
         COALESCE(
           ceil(extract(epoch FROM (
             min(consumed_at) + interval '10 minutes' - v_now
           )))::integer,
           0
         )
  INTO v_short_count, v_retry_after
  FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at > v_now - interval '10 minutes';

  SELECT count(*)::integer
  INTO v_day_count
  FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at >= v_day_start;

  IF v_short_count >= 10 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'ten_minute_limit',
      'limit', 10,
      'remaining', 0,
      'retry_after_seconds', GREATEST(v_retry_after, 1),
      'reset_at', v_now + make_interval(
        secs => GREATEST(v_retry_after, 1)
      )
    );
  END IF;

  IF v_day_count >= 100 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'limit', 100,
      'remaining', 0,
      'retry_after_seconds', GREATEST(
        ceil(extract(epoch FROM (v_day_reset - v_now)))::integer,
        1
      ),
      'reset_at', v_day_reset
    );
  END IF;

  INSERT INTO public.board_unfurl_usage(user_id, consumed_at)
  VALUES (v_user_id, v_now);

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', NULL,
    'limit', jsonb_build_object('ten_minutes', 10, 'day', 100),
    'remaining', jsonb_build_object(
      'ten_minutes', 9 - v_short_count,
      'day', 99 - v_day_count
    ),
    'retry_after_seconds', 0,
    'reset_at', v_day_reset
  );
END;
$$;

COMMENT ON FUNCTION public.consume_board_unfurl_quota(uuid) IS
  'Atomically consumes one URL-unfurl allowance for the authenticated user or '
  'a service-role supplied user. Returns structured allowed/limit/retry data; '
  'denied attempts do not create usage rows.';

REVOKE ALL ON FUNCTION public.consume_board_unfurl_quota(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_board_unfurl_quota(uuid)
  TO authenticated, service_role;

-- ── 3. job_runs-compatible edge dispatch and completion ───────────────────────

CREATE OR REPLACE FUNCTION public.dispatch_board_asset_gc(
  p_dry_run boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id bigint;
  v_request_id bigint;
BEGIN
  INSERT INTO public.job_runs(job_name, status, detail)
  VALUES (
    'board-asset-gc',
    'running',
    jsonb_build_object(
      'dry_run', p_dry_run,
      'grace_days', 14,
      'dispatch_state', 'starting'
    )
  )
  RETURNING id INTO v_run_id;

  BEGIN
    SELECT public.invoke_edge_function(
      'board-asset-cleanup',
      jsonb_build_object(
        'dry_run', p_dry_run,
        'grace_days', 14,
        'job_name', 'board-asset-gc',
        'job_run_id', v_run_id
      )
    )
    INTO v_request_id;

    IF v_request_id IS NULL THEN
      UPDATE public.job_runs
      SET status = 'failed',
          finished_at = now(),
          error = 'edge dispatch skipped: Supabase URL/service key unavailable',
          detail = detail || jsonb_build_object('dispatch_state', 'not_sent')
      WHERE id = v_run_id;
    ELSE
      UPDATE public.job_runs
      SET detail = detail || jsonb_build_object(
        'dispatch_state', 'sent',
        'request_id', v_request_id
      )
      WHERE id = v_run_id;
      -- The future edge function owns the terminal succeeded/failed update via
      -- finish_board_asset_gc_run(). Enqueue success is not job success.
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.job_runs
    SET status = 'failed',
        finished_at = now(),
        error = SQLERRM,
        detail = detail || jsonb_build_object('dispatch_state', 'error')
    WHERE id = v_run_id;
  END;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_board_asset_gc_run(
  p_run_id bigint,
  p_status text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid board asset GC terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.job_runs
  SET status = p_status,
      finished_at = now(),
      detail = detail || COALESCE(p_detail, '{}'::jsonb),
      error = CASE WHEN p_status = 'failed' THEN p_error ELSE NULL END
  WHERE id = p_run_id
    AND job_name = 'board-asset-gc'
    AND status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'running board asset GC job % not found', p_run_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_board_asset_gc(boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_board_asset_gc_run(
  bigint, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_board_asset_gc(boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_board_asset_gc_run(
  bigint, text, jsonb, text
) TO service_role;

-- ── 4. Guarded daily dry-run cron ───────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'board-asset-gc-dry-run'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'board-asset-gc-dry-run',
      '17 4 * * *',
      $command$SELECT public.dispatch_board_asset_gc(true);$command$
    );
  END IF;
END
$cron$;

DO $comment$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Mood Board: board-asset-gc-dry-run daily at 04:17 UTC dispatches future board-asset-cleanup with dry_run=true + 14-day grace; terminal history belongs in job_runs(job_name=board-asset-gc). Earlier schedules are unchanged.'$C$;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$comment$;
