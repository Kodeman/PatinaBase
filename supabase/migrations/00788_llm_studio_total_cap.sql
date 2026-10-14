-- ═══════════════════════════════════════════════════════════════════════════
-- 00788 — Cross-feature monthly studio spend cap for model usage
-- Builds on the latest llm_reserve and llm_set_controls definitions in 00770.
-- A studio override now sets its total monthly cap across all features; feature
-- monthly caps remain independent limits and are never replaced by an override.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.llm_controls
  ADD COLUMN IF NOT EXISTS studio_monthly_cap_usd numeric(12,2)
  CHECK (studio_monthly_cap_usd IS NULL OR studio_monthly_cap_usd >= 0);
ALTER TABLE public.llm_controls
  ALTER COLUMN studio_monthly_cap_usd SET DEFAULT 50;

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
  v_total_studio_cap numeric;
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

  -- Preserve the existing lock order: controls singleton, then feature row.
  -- The singleton lock serializes reservations and protects the global aggregate.
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
        -- The feature-level studio cap applies independently of a studio override.
        IF v_feature_monthly_cap IS NOT NULL THEN
          SELECT COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END), 0)
            INTO v_spent
            FROM public.llm_usage AS u
           WHERE u.feature = p_feature AND u.studio_id = p_studio_id
             AND u.at >= v_month_start AND u.at < v_month_end
             AND u.status IN ('settled','error','reserved');
          IF v_spent >= v_feature_monthly_cap OR v_spent + p_est_usd > v_feature_monthly_cap THEN
            v_reason := 'studio_monthly';
            v_resets_at := v_month_end;
          END IF;
        END IF;

        -- Overrides define the total cap. A present NULL override means uncapped.
        IF v_reason IS NULL THEN
          SELECT override.monthly_cap_usd
            INTO v_total_studio_cap
            FROM public.llm_studio_overrides AS override
           WHERE override.studio_id = p_studio_id;
          v_override_exists := FOUND;
          IF NOT v_override_exists THEN
            SELECT controls.studio_monthly_cap_usd
              INTO v_total_studio_cap
              FROM public.llm_controls AS controls WHERE controls.id;
          END IF;
          IF v_total_studio_cap IS NOT NULL THEN
            SELECT COALESCE(sum(u.usd + CASE WHEN u.status = 'reserved' THEN u.reserved_usd ELSE 0 END), 0)
              INTO v_spent
              FROM public.llm_usage AS u
             WHERE u.studio_id = p_studio_id
               AND u.at >= v_month_start AND u.at < v_month_end
               AND u.status IN ('settled','error','reserved');
            IF v_spent >= v_total_studio_cap OR v_spent + p_est_usd > v_total_studio_cap THEN
              v_reason := 'studio_cap';
              v_resets_at := v_month_end;
            END IF;
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

-- Five-argument setter distinguishes omitted from explicit NULL monthly cap. Keep the historical
-- three-argument signature as a wrapper for existing callers; it never changes
-- the monthly cap. Both paths audit the full before/after controls state.
CREATE OR REPLACE FUNCTION public.llm_set_controls(
  p_kill_switch boolean, p_global_daily_cap numeric, p_actor uuid,
  p_studio_monthly_cap numeric, p_set_studio_monthly_cap boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF p_set_studio_monthly_cap IS NULL
     OR (p_kill_switch IS NULL AND p_global_daily_cap IS NULL AND NOT p_set_studio_monthly_cap)
     OR (p_global_daily_cap IS NOT NULL AND p_global_daily_cap < 0)
     OR (p_studio_monthly_cap IS NOT NULL AND p_studio_monthly_cap < 0) THEN
    RAISE EXCEPTION 'invalid controls' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_build_object('kill_switch', kill_switch, 'global_daily_cap_usd', global_daily_cap_usd,
    'studio_monthly_cap_usd', studio_monthly_cap_usd)
    INTO v_before FROM public.llm_controls WHERE id FOR UPDATE;
  UPDATE public.llm_controls SET
    kill_switch = COALESCE(p_kill_switch, kill_switch),
    global_daily_cap_usd = COALESCE(p_global_daily_cap, global_daily_cap_usd),
    studio_monthly_cap_usd = CASE WHEN p_set_studio_monthly_cap
                                  THEN p_studio_monthly_cap ELSE studio_monthly_cap_usd END,
    updated_at = now() WHERE id;
  SELECT jsonb_build_object('kill_switch', kill_switch, 'global_daily_cap_usd', global_daily_cap_usd,
    'studio_monthly_cap_usd', studio_monthly_cap_usd)
    INTO v_after FROM public.llm_controls WHERE id;
  INSERT INTO public.llm_controls_audit(actor, target, before, after)
  VALUES (p_actor, 'controls', v_before, v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.llm_set_controls(p_kill_switch boolean, p_global_daily_cap numeric, p_actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT public.llm_set_controls(p_kill_switch, p_global_daily_cap, p_actor, NULL, false);
$$;

REVOKE ALL ON FUNCTION public.llm_reserve(text, uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_reserve(text, uuid, uuid, numeric, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.llm_set_controls(boolean, numeric, uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_set_controls(boolean, numeric, uuid, numeric, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.llm_set_controls(boolean, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_set_controls(boolean, numeric, uuid) TO service_role;
