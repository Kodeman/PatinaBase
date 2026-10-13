-- ═══════════════════════════════════════════════════════════════════════════
-- 00770 — Shared LLM usage ledger and spend controls (US-30 A1)
-- New objects only, except aesthete_spend_ledger is migrated and replaced by a
-- compatibility view. The ledger intentionally stores usage metadata only;
-- prompt and completion content are never recorded.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Usage ledger ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.llm_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL,
  role text,
  model text,
  prompt_version text,
  studio_id uuid,
  user_id uuid,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (usd >= 0),
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  status text NOT NULL CHECK (status IN ('reserved','settled','error','denied')),
  stop_reason text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  request_id text,
  -- Product count carried from the retired aesthete_spend_ledger rows (§5);
  -- NULL on every call recorded through llm_reserve.
  products integer CHECK (products IS NULL OR products >= 0)
);
CREATE INDEX IF NOT EXISTS llm_usage_feature_at_idx ON public.llm_usage (feature, at);
CREATE INDEX IF NOT EXISTS llm_usage_studio_at_idx ON public.llm_usage (studio_id, at);
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS llm_usage_select_admin ON public.llm_usage;
CREATE POLICY llm_usage_select_admin ON public.llm_usage FOR SELECT TO authenticated
  USING (public.user_has_role(auth.uid(), 'super_admin'));
REVOKE ALL ON TABLE public.llm_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.llm_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.llm_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.llm_usage_id_seq TO service_role;

-- ── 2. Controls ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.llm_controls (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  kill_switch boolean NOT NULL DEFAULT false,
  global_daily_cap_usd numeric(12,6) NOT NULL DEFAULT 25 CHECK (global_daily_cap_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.llm_controls (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.llm_feature_controls (
  feature text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  daily_cap_usd numeric(12,6) CHECK (daily_cap_usd IS NULL OR daily_cap_usd >= 0),
  studio_monthly_cap_usd numeric(12,6) CHECK (studio_monthly_cap_usd IS NULL OR studio_monthly_cap_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.llm_feature_controls (feature, enabled, daily_cap_usd)
VALUES ('aesthete-dna-draft', true, 20), ('board-deck-import', true, NULL),
       ('ffe-extract', true, NULL), ('field-parse', false, NULL), ('companion', false, NULL)
ON CONFLICT (feature) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.llm_studio_overrides (
  studio_id uuid PRIMARY KEY,
  monthly_cap_usd numeric(12,6) CHECK (monthly_cap_usd IS NULL OR monthly_cap_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.llm_controls_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  target text NOT NULL,
  before jsonb,
  after jsonb NOT NULL
);

ALTER TABLE public.llm_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_feature_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_studio_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_controls_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_controls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_feature_controls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_studio_overrides FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.llm_controls_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_controls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_feature_controls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_studio_overrides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_controls_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.llm_controls_audit_id_seq TO service_role;

-- ── 3. Reserve and settle ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.llm_reserve(
  p_feature text, p_studio_id uuid, p_user_id uuid, p_est_usd numeric,
  p_role text, p_prompt_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_kill boolean;
  v_global_cap numeric;
  v_enabled boolean;
  v_feature_daily_cap numeric;
  v_feature_monthly_cap numeric;
  v_studio_cap numeric;
  v_override_exists boolean;
  v_spent numeric;
  v_reason text;
  v_resets_at timestamptz;
  v_usage_id bigint;
BEGIN
  IF p_feature IS NULL OR btrim(p_feature) = '' OR p_est_usd IS NULL OR p_est_usd < 0 THEN
    RAISE EXCEPTION 'feature and non-negative estimate are required' USING ERRCODE = 'check_violation';
  END IF;

  v_day_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day_end := v_day_start + interval '1 day';
  v_month_start := date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_end := v_month_start + interval '1 month';

  -- This singleton lock serializes all reservations and protects both the
  -- global aggregate and missing-feature-row decisions from concurrent calls.
  SELECT controls.kill_switch, controls.global_daily_cap_usd
    INTO v_kill, v_global_cap
    FROM public.llm_controls AS controls WHERE controls.id FOR UPDATE;

  SELECT controls.enabled, controls.daily_cap_usd, controls.studio_monthly_cap_usd
    INTO v_enabled, v_feature_daily_cap, v_feature_monthly_cap
    FROM public.llm_feature_controls AS controls
   WHERE controls.feature = p_feature FOR UPDATE;

  IF v_kill IS TRUE THEN
    v_reason := 'kill';
  ELSIF v_enabled IS DISTINCT FROM TRUE THEN
    v_reason := 'disabled';
  ELSE
    -- Spend is usd on settled and error rows (a failed call can still be
    -- billed) plus the live estimate on reserved rows; denied rows cost
    -- nothing. llm_usage_summary reports the same total.
    SELECT COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END), 0)
      INTO v_spent
      FROM public.llm_usage AS u
     WHERE u.at >= v_day_start AND u.at < v_day_end
       AND u.status IN ('settled','error','reserved');
    IF v_spent >= v_global_cap OR v_spent + p_est_usd > v_global_cap THEN
      v_reason := 'global_daily';
      v_resets_at := v_day_end;
    ELSE
      SELECT COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END), 0)
        INTO v_spent
        FROM public.llm_usage AS u
       WHERE u.feature = p_feature AND u.at >= v_day_start AND u.at < v_day_end
         AND u.status IN ('settled','error','reserved');
      IF v_feature_daily_cap IS NOT NULL
         AND (v_spent >= v_feature_daily_cap OR v_spent + p_est_usd > v_feature_daily_cap) THEN
        v_reason := 'feature_daily';
        v_resets_at := v_day_end;
      ELSIF p_studio_id IS NOT NULL THEN
        SELECT override.monthly_cap_usd
          INTO v_studio_cap
          FROM public.llm_studio_overrides AS override
         WHERE override.studio_id = p_studio_id;
        v_override_exists := FOUND;
        IF NOT v_override_exists THEN
          v_studio_cap := v_feature_monthly_cap;
        END IF;
        IF v_studio_cap IS NOT NULL THEN
          SELECT COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END), 0)
            INTO v_spent
            FROM public.llm_usage AS u
           WHERE u.feature = p_feature AND u.studio_id = p_studio_id
             AND u.at >= v_month_start AND u.at < v_month_end
             AND u.status IN ('settled','error','reserved');
          IF v_spent >= v_studio_cap OR v_spent + p_est_usd > v_studio_cap THEN
            v_reason := 'studio_monthly';
            v_resets_at := v_month_end;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.llm_usage (at, feature, role, prompt_version, studio_id, user_id,
                                usd, reserved_usd, status, stop_reason)
  VALUES (v_now, p_feature, p_role, p_prompt_version, p_studio_id, p_user_id, 0,
          CASE WHEN v_reason IS NULL THEN p_est_usd ELSE 0 END,
          CASE WHEN v_reason IS NULL THEN 'reserved' ELSE 'denied' END, v_reason)
  RETURNING id INTO v_usage_id;

  RETURN jsonb_build_object(
    'granted', v_reason IS NULL,
    'reason', v_reason,
    'usage_id', v_usage_id,
    'resets_at', v_resets_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.llm_settle(
  p_usage_id bigint, p_model text, p_input_tokens integer, p_output_tokens integer,
  p_cache_read_tokens integer, p_cache_write_tokens integer, p_usd numeric,
  p_status text, p_stop_reason text, p_latency_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('settled','error') OR p_usd IS NULL OR p_usd < 0
     OR COALESCE(p_input_tokens, -1) < 0 OR COALESCE(p_output_tokens, -1) < 0
     OR COALESCE(p_cache_read_tokens, -1) < 0 OR COALESCE(p_cache_write_tokens, -1) < 0
     OR COALESCE(p_latency_ms, -1) < 0 THEN
    RAISE EXCEPTION 'invalid settlement fields' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.llm_usage
     SET status = p_status, model = p_model,
         input_tokens = p_input_tokens, output_tokens = p_output_tokens,
         cache_read_tokens = p_cache_read_tokens, cache_write_tokens = p_cache_write_tokens,
         usd = p_usd, reserved_usd = 0, stop_reason = p_stop_reason,
         latency_ms = p_latency_ms
   WHERE id = p_usage_id
     -- A swept reservation still takes its late real usage once; that settle
     -- replaces stop_reason, so any repeat is a no-op like on a settled row.
     AND (status = 'reserved' OR (status = 'error' AND stop_reason = 'stale_reservation'));
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.llm_usage WHERE id = p_usage_id) THEN
    RAISE EXCEPTION 'unknown llm usage id %', p_usage_id USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.llm_sweep_stale_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  -- The estimate becomes the recorded cost, so a call whose settle never
  -- arrived still counts toward the caps.
  UPDATE public.llm_usage
     SET status = 'error', usd = reserved_usd, reserved_usd = 0, stop_reason = 'stale_reservation'
   WHERE status = 'reserved' AND at < clock_timestamp() - interval '10 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 4. Summary and audited setters ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.llm_usage_summary(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Same spend rule as llm_reserve: usd on settled and error rows plus the
  -- live estimate on reserved rows; denied rows are neither spend nor calls.
  SELECT jsonb_build_object(
    'by_feature', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('feature', q.feature, 'usd', q.usd,
        'input_tokens', q.input_tokens, 'output_tokens', q.output_tokens, 'calls', q.calls)
        ORDER BY q.feature)
      FROM (SELECT u.feature,
              sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END)::numeric(12,6) AS usd,
              sum(u.input_tokens)::bigint AS input_tokens,
              sum(u.output_tokens)::bigint AS output_tokens, count(*)::bigint AS calls
              FROM public.llm_usage u WHERE u.at >= p_from AND u.at < p_to
               AND u.status IN ('settled','error','reserved')
              GROUP BY u.feature) q), '[]'::jsonb),
    'by_studio', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('studio_id', q.studio_id, 'usd', q.usd,
        'input_tokens', q.input_tokens, 'output_tokens', q.output_tokens, 'calls', q.calls)
        ORDER BY q.studio_id)
      FROM (SELECT u.studio_id,
              sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END)::numeric(12,6) AS usd,
              sum(u.input_tokens)::bigint AS input_tokens,
              sum(u.output_tokens)::bigint AS output_tokens, count(*)::bigint AS calls
              FROM public.llm_usage u WHERE u.studio_id IS NOT NULL AND u.at >= p_from AND u.at < p_to
               AND u.status IN ('settled','error','reserved')
              GROUP BY u.studio_id) q), '[]'::jsonb),
    'totals', (SELECT jsonb_build_object(
        'usd', COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END),0)::numeric(12,6),
        'input_tokens', COALESCE(sum(u.input_tokens),0)::bigint,
        'output_tokens', COALESCE(sum(u.output_tokens),0)::bigint, 'calls', count(*)::bigint)
      FROM public.llm_usage u WHERE u.at >= p_from AND u.at < p_to
       AND u.status IN ('settled','error','reserved'))
  );
$$;

CREATE OR REPLACE FUNCTION public.llm_set_controls(p_kill_switch boolean, p_global_daily_cap numeric, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF (p_kill_switch IS NULL AND p_global_daily_cap IS NULL)
     OR (p_global_daily_cap IS NOT NULL AND p_global_daily_cap < 0) THEN
    RAISE EXCEPTION 'invalid controls' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_build_object('kill_switch', kill_switch, 'global_daily_cap_usd', global_daily_cap_usd)
    INTO v_before FROM public.llm_controls WHERE id FOR UPDATE;
  UPDATE public.llm_controls SET
    kill_switch = COALESCE(p_kill_switch, kill_switch),
    global_daily_cap_usd = COALESCE(p_global_daily_cap, global_daily_cap_usd),
    updated_at = now() WHERE id;
  SELECT jsonb_build_object('kill_switch', kill_switch, 'global_daily_cap_usd', global_daily_cap_usd)
    INTO v_after FROM public.llm_controls WHERE id;
  INSERT INTO public.llm_controls_audit(actor, target, before, after)
  VALUES (p_actor, 'controls', v_before, v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.llm_set_feature_control(
  p_feature text, p_enabled boolean, p_daily_cap numeric, p_studio_monthly_cap numeric, p_actor uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF p_feature IS NULL OR btrim(p_feature) = '' OR p_enabled IS NULL
     OR p_daily_cap < 0 OR p_studio_monthly_cap < 0 THEN
    RAISE EXCEPTION 'invalid feature controls' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_build_object('enabled', enabled, 'daily_cap_usd', daily_cap_usd,
    'studio_monthly_cap_usd', studio_monthly_cap_usd)
    INTO v_before FROM public.llm_feature_controls WHERE feature = p_feature FOR UPDATE;
  INSERT INTO public.llm_feature_controls(feature, enabled, daily_cap_usd, studio_monthly_cap_usd, updated_at)
  VALUES (p_feature, p_enabled, p_daily_cap, p_studio_monthly_cap, now())
  ON CONFLICT (feature) DO UPDATE SET enabled = EXCLUDED.enabled,
    daily_cap_usd = EXCLUDED.daily_cap_usd,
    studio_monthly_cap_usd = EXCLUDED.studio_monthly_cap_usd, updated_at = now();
  v_after := jsonb_build_object('enabled', p_enabled, 'daily_cap_usd', p_daily_cap,
    'studio_monthly_cap_usd', p_studio_monthly_cap);
  INSERT INTO public.llm_controls_audit(actor, target, before, after)
  VALUES (p_actor, 'feature:' || p_feature, v_before, v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.llm_set_studio_override(p_studio uuid, p_cap numeric, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF p_studio IS NULL OR p_cap < 0 THEN
    RAISE EXCEPTION 'invalid studio override' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_build_object('monthly_cap_usd', monthly_cap_usd)
    INTO v_before FROM public.llm_studio_overrides WHERE studio_id = p_studio FOR UPDATE;
  INSERT INTO public.llm_studio_overrides(studio_id, monthly_cap_usd, updated_at)
  VALUES (p_studio, p_cap, now())
  ON CONFLICT (studio_id) DO UPDATE SET monthly_cap_usd = EXCLUDED.monthly_cap_usd, updated_at = now();
  v_after := jsonb_build_object('monthly_cap_usd', p_cap);
  INSERT INTO public.llm_controls_audit(actor, target, before, after)
  VALUES (p_actor, 'studio:' || p_studio::text, v_before, v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.llm_reserve(text, uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_reserve(text, uuid, uuid, numeric, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.llm_settle(bigint, text, integer, integer, integer, integer, numeric, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_settle(bigint, text, integer, integer, integer, integer, numeric, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.llm_sweep_stale_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_sweep_stale_reservations() TO service_role;
REVOKE ALL ON FUNCTION public.llm_usage_summary(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_usage_summary(timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.llm_set_controls(boolean, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_set_controls(boolean, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.llm_set_feature_control(text, boolean, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_set_feature_control(text, boolean, numeric, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.llm_set_studio_override(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_set_studio_override(uuid, numeric, uuid) TO service_role;

-- ── 5. Migrate the daily ledger and preserve its read shape ──────────────────
INSERT INTO public.llm_usage (
  at, feature, role, model, prompt_version, input_tokens, output_tokens,
  cache_read_tokens, usd, status, products
)
SELECT (ledger.day::timestamp AT TIME ZONE 'UTC'), 'aesthete-dna-draft', 'draft',
       'legacy', 'legacy', COALESCE(ledger.input_tokens, 0),
       COALESCE(ledger.output_tokens, 0), COALESCE(ledger.cache_read_tokens, 0),
       COALESCE(ledger.usd, 0), 'settled', COALESCE(ledger.products, 0)
  FROM public.aesthete_spend_ledger AS ledger
ON CONFLICT DO NOTHING;

DROP TABLE public.aesthete_spend_ledger;
CREATE VIEW public.aesthete_spend_ledger WITH (security_invoker = true) AS
SELECT (date_trunc('day', u.at AT TIME ZONE 'UTC'))::date AS day,
       sum(u.input_tokens)::bigint AS input_tokens,
       sum(u.output_tokens)::bigint AS output_tokens,
       sum(u.cache_read_tokens)::bigint AS cache_read_tokens,
       sum(u.usd)::numeric(12,6) AS usd,
       COALESCE(sum(u.products), 0)::integer AS products
  FROM public.llm_usage AS u
 WHERE u.feature = 'aesthete-dna-draft' AND u.status = 'settled'
 GROUP BY (date_trunc('day', u.at AT TIME ZONE 'UTC'))::date;
REVOKE ALL ON TABLE public.aesthete_spend_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aesthete_spend_ledger TO authenticated, service_role;

-- ── 6. Stale reservation cron ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'llm-sweep-stale-reservations') THEN
    PERFORM cron.unschedule('llm-sweep-stale-reservations');
  END IF;
  PERFORM cron.schedule(
    'llm-sweep-stale-reservations', '*/10 * * * *',
    $job$SELECT public.llm_sweep_stale_reservations();$job$
  );
END;
$$;

-- ── 7. Studio resolver for the service-role caller ──────────────────────────
-- 00484 revoked _primary_studio_for from every PostgREST role. The shared
-- edge caller resolver (_shared/caller.ts) runs as service_role and needs it
-- to attribute spend to a studio cap. anon and authenticated stay revoked.
GRANT EXECUTE ON FUNCTION public._primary_studio_for(uuid) TO service_role;
