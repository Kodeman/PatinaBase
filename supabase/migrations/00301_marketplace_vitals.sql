-- ═══════════════════════════════════════════════════════════════════════════
-- 00301 — Agent OS: Marketplace Vitals strip (WP-1.2)
--
-- Four config-driven tiles above the Mission Control inbox: liquidity ratio,
-- GMV/designer (trailing 30d), take-rate integrity, attach rate (placeholder
-- until WP-3.1). Ships:
--   1. metric_thresholds — config table driving green/yellow/red bands so
--      semantics stay stable independent of the query logic. Seeded with the
--      4 tiles below.
--   2. marketplace_vitals — MATERIALIZED VIEW, one row per metric_key, with
--      current + prior-30d-window values. Locked down to service_role; no
--      portal surface reads it directly.
--   3. refresh_marketplace_vitals() — SECURITY DEFINER refresh + job_runs
--      bookkeeping (00300 job_runs idiom: one row per invocation, failure
--      path RETURNs rather than RAISEs so a failed refresh still leaves an
--      auditable job_runs row instead of aborting silently).
--   4. get_marketplace_vitals() — SECURITY DEFINER RPC joining the matview to
--      thresholds and computing the band server-side, so the admin-portal
--      route stays a trivial `.rpc()` call with no client-side band logic.
--   5. Guarded nightly cron (08:30 UTC) calling refresh_marketplace_vitals().
--
-- Schema audit (VERIFIED against, or adjusted — see inline notes per metric):
--   • "designer" — modeled as an RBAC domain, not a single role name. 00021
--     defines role_domain enum ('consumer','designer','manufacturer','admin')
--     and roles.domain; 00022 seeds 4 designer-domain roles (independent_
--     designer, studio_owner, studio_admin, studio_designer). profiles.
--     is_designer (00030) is a denormalized convenience flag for the iOS
--     search path, not kept in sync with role grants/revokes generally — the
--     RBAC join (user_roles ⨝ roles WHERE domain='designer') is the source of
--     truth and is what this migration uses for "active designers."
--   • pipeline_vendors.stage='live' (00076) — confirmed valid enum value
--     (stage_check CHECK includes 'live').
--   • invoice_payments (00178): status='succeeded', amount_cents, received_at.
--   • po_payments (00148): state (po_payment_state enum: pending/due/paid) —
--     NOT a "status" column; amount_cents; paid_date is DATE (not
--     timestamptz) — window comparisons cast the boundary to ::date.
--   • direct_orders (00276): status='paid', amount_cents, paid_at. No
--     designer attribution (client_id is the buyer) — direct_orders GMV folds
--     into the platform-wide numerator only, consistent with the WP-1.2 spec
--     reading "aggregate GMV ÷ active designers," not a per-designer sum.
--   • designer_earnings (00014, contra rows added by 00277): status IN
--     ('pending','confirmed','paid','cancelled'); 00277 confirms revenue rows
--     land in 'confirmed' (Stripe, pending payout) or 'paid' (manual methods)
--     and refund contra rows mirror the original's status with negated
--     gross_amount/platform_fee/net_amount — summing status IN
--     ('confirmed','paid') over earned_at nets reversals out correctly
--     without a separate exclusion.
--   • Adjustment: liquidity_ratio has no natural revenue-style "trailing 30d"
--     window — it is a live headcount ratio, not a windowed sum. No
--     time-series snapshot table exists for designer/maker counts, so
--     prev_value approximates "as of 30 days ago" using the only two
--     timestamps available: user_roles.granted_at (designers not yet granted
--     30+ days ago are excluded) and pipeline_vendors.stage_changed_at
--     (makers whose CURRENT stage='live' entry postdates the cutoff are
--     excluded). This is a documented approximation — it undercounts a maker
--     that was live, dropped out, and re-entered 'live' within the window,
--     since only the current stage transition timestamp is retained.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. metric_thresholds — config table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metric_thresholds (
  metric_key   text PRIMARY KEY,
  label        text NOT NULL,
  unit         text NOT NULL CHECK (unit IN ('ratio', 'usd', 'pct')),
  green_min    numeric,
  green_max    numeric,
  yellow_min   numeric,
  yellow_max   numeric,
  display_order int NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.metric_thresholds IS
  'Agent OS (00301, WP-1.2): green/yellow/red band config for the Marketplace Vitals strip. All-null bounds = neutral (no threshold semantics). Read by get_marketplace_vitals(); no portal writes.';

ALTER TABLE public.metric_thresholds ENABLE ROW LEVEL SECURITY;

-- RLS: admin-domain SELECT only (00300 job_runs_select_admin idiom). No
-- INSERT/UPDATE/DELETE policy — config changes go through a future admin
-- tool or direct migration, never a client write.
DROP POLICY IF EXISTS metric_thresholds_select_admin ON public.metric_thresholds;
CREATE POLICY metric_thresholds_select_admin
  ON public.metric_thresholds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

GRANT SELECT ON public.metric_thresholds TO authenticated;

INSERT INTO public.metric_thresholds
  (metric_key, label, unit, green_min, green_max, yellow_min, yellow_max, display_order, active)
VALUES
  ('liquidity_ratio',       'Liquidity ratio',        'ratio', 1.0,  3.0,  0.5,  4.0,  1, true),
  ('gmv_per_designer_30d',  'GMV / designer (30d)',   'usd',   NULL, NULL, NULL, NULL, 2, true),
  ('take_rate_pct',         'Take-rate integrity',    'pct',   15,   18,   12,   20,   3, true),
  ('attach_rate',           'Attach rate',            'ratio', NULL, NULL, NULL, NULL, 4, false)
ON CONFLICT (metric_key) DO UPDATE SET
  label         = EXCLUDED.label,
  unit          = EXCLUDED.unit,
  green_min     = EXCLUDED.green_min,
  green_max     = EXCLUDED.green_max,
  yellow_min    = EXCLUDED.yellow_min,
  yellow_max    = EXCLUDED.yellow_max,
  display_order = EXCLUDED.display_order,
  active        = EXCLUDED.active,
  updated_at    = now();

-- ─── 2. marketplace_vitals — MATERIALIZED VIEW ──────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.marketplace_vitals;

CREATE MATERIALIZED VIEW public.marketplace_vitals AS
WITH designers_now AS (
  -- Active designers = distinct users holding any designer-domain role
  -- (VERIFIED against 00021/00022 — domain is the RBAC classification, not a
  -- single role name).
  SELECT count(DISTINCT ur.user_id)::numeric AS n
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.domain = 'designer'
),
designers_30d_ago AS (
  -- Approximation for liquidity_ratio.prev_value — see migration banner.
  SELECT count(DISTINCT ur.user_id)::numeric AS n
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.domain = 'designer'
    AND ur.granted_at < now() - interval '30 days'
),
makers_now AS (
  -- Live makers = pipeline_vendors.stage='live' (VERIFIED against 00076
  -- stage_check constraint).
  SELECT count(*)::numeric AS n
  FROM public.pipeline_vendors
  WHERE stage = 'live'
),
makers_30d_ago AS (
  -- Approximation for liquidity_ratio.prev_value — see migration banner.
  SELECT count(*)::numeric AS n
  FROM public.pipeline_vendors
  WHERE stage = 'live'
    AND stage_changed_at < now() - interval '30 days'
),
gmv_curr AS (
  SELECT
      COALESCE((SELECT sum(amount_cents) FROM public.invoice_payments
                 WHERE status = 'succeeded'
                   AND received_at >= now() - interval '30 days'), 0)
    + COALESCE((SELECT sum(amount_cents) FROM public.po_payments
                 WHERE state = 'paid'
                   AND paid_date >= (now() - interval '30 days')::date), 0)
    + COALESCE((SELECT sum(amount_cents) FROM public.direct_orders
                 WHERE status = 'paid'
                   AND paid_at >= now() - interval '30 days'), 0)
    AS cents
),
gmv_prev AS (
  SELECT
      COALESCE((SELECT sum(amount_cents) FROM public.invoice_payments
                 WHERE status = 'succeeded'
                   AND received_at >= now() - interval '60 days'
                   AND received_at <  now() - interval '30 days'), 0)
    + COALESCE((SELECT sum(amount_cents) FROM public.po_payments
                 WHERE state = 'paid'
                   AND paid_date >= (now() - interval '60 days')::date
                   AND paid_date <  (now() - interval '30 days')::date), 0)
    + COALESCE((SELECT sum(amount_cents) FROM public.direct_orders
                 WHERE status = 'paid'
                   AND paid_at >= now() - interval '60 days'
                   AND paid_at <  now() - interval '30 days'), 0)
    AS cents
),
earnings_curr AS (
  -- status IN ('confirmed','paid') per 00277: Stripe design-fee revenue lands
  -- 'confirmed', manual methods land 'paid'; refund contra rows mirror the
  -- original's status with negated amounts, so summing nets reversals out.
  SELECT sum(gross_amount) AS gross, sum(platform_fee) AS fee
  FROM public.designer_earnings
  WHERE status IN ('confirmed', 'paid')
    AND earned_at >= now() - interval '30 days'
),
earnings_prev AS (
  SELECT sum(gross_amount) AS gross, sum(platform_fee) AS fee
  FROM public.designer_earnings
  WHERE status IN ('confirmed', 'paid')
    AND earned_at >= now() - interval '60 days'
    AND earned_at <  now() - interval '30 days'
)
SELECT
  'liquidity_ratio'::text AS metric_key,
  (dn.n / NULLIF(mn.n, 0))  AS value,
  (d30.n / NULLIF(m30.n, 0)) AS prev_value,
  now() AS computed_at
FROM designers_now dn, makers_now mn, designers_30d_ago d30, makers_30d_ago m30

UNION ALL

SELECT
  'gmv_per_designer_30d'::text,
  (gc.cents::numeric / 100) / NULLIF(dn.n, 0),
  (gp.cents::numeric / 100) / NULLIF(dn.n, 0),
  now()
FROM gmv_curr gc, gmv_prev gp, designers_now dn

UNION ALL

SELECT
  'take_rate_pct'::text,
  CASE WHEN COALESCE(ec.gross, 0) = 0 THEN NULL
       ELSE (ec.fee::numeric / ec.gross::numeric) * 100 END,
  CASE WHEN COALESCE(ep.gross, 0) = 0 THEN NULL
       ELSE (ep.fee::numeric / ep.gross::numeric) * 100 END,
  now()
FROM earnings_curr ec, earnings_prev ep

UNION ALL

SELECT
  'attach_rate'::text,
  NULL::numeric,
  NULL::numeric,
  now();

COMMENT ON MATERIALIZED VIEW public.marketplace_vitals IS
  'Agent OS (00301, WP-1.2): one row per Marketplace Vitals metric_key (liquidity_ratio, gmv_per_designer_30d, take_rate_pct, attach_rate). value/prev_value are trailing-30d windows (days 0-30 / 31-60), except liquidity_ratio which is a live headcount ratio approximated at two points in time (see migration banner). Refreshed by refresh_marketplace_vitals() (nightly cron + manual). service_role only — get_marketplace_vitals() is the read path for the admin-portal route.';

-- REFRESH ... CONCURRENTLY requires a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_vitals_metric_key
  ON public.marketplace_vitals (metric_key);

REVOKE ALL ON public.marketplace_vitals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_vitals TO service_role;

-- ─── 3. refresh_marketplace_vitals() — refresh + job_runs bookkeeping ───────
CREATE OR REPLACE FUNCTION public.refresh_marketplace_vitals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id bigint;
BEGIN
  INSERT INTO public.job_runs (job_name, status)
  VALUES ('marketplace-vitals-refresh', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- REFRESH ... CONCURRENTLY cannot run inside a function/transaction block
    -- (same restriction documented in 00245) — the inner EXCEPTION always
    -- catches it here and falls back to the plain (locking) refresh, which is
    -- transaction-safe. Written as try/fallback anyway so the intent is
    -- explicit and the plain path is exercised via the same code either way.
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.marketplace_vitals;
    EXCEPTION WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW public.marketplace_vitals;
    END;
  EXCEPTION WHEN OTHERS THEN
    -- Deliberately NO re-RAISE — same lesson as groom_agent_tasks (00300): a
    -- re-raise would abort the top-level transaction and roll back the
    -- 'running' row too, leaving no job_runs row at all for a failed refresh.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now()
   WHERE id = v_run_id;

  RETURN jsonb_build_object('refreshed', true);
END;
$$;

COMMENT ON FUNCTION public.refresh_marketplace_vitals() IS
  'Agent OS (00301, WP-1.2): refreshes marketplace_vitals and records one job_runs row (job_name=marketplace-vitals-refresh) per invocation. Tries REFRESH CONCURRENTLY, falls back to a plain refresh (CONCURRENTLY cannot run inside this function — see 00245 precedent). Failure path RETURNs rather than RAISEs so the job_runs row always persists.';

REVOKE ALL ON FUNCTION public.refresh_marketplace_vitals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_marketplace_vitals() TO service_role;

-- ─── 4. get_marketplace_vitals() — matview ⨝ thresholds, band computed here ─
CREATE OR REPLACE FUNCTION public.get_marketplace_vitals()
RETURNS TABLE(
  metric_key    text,
  label         text,
  unit          text,
  value         numeric,
  prev_value    numeric,
  band          text,
  active        boolean,
  display_order int,
  computed_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.metric_key,
    t.label,
    t.unit,
    v.value,
    v.prev_value,
    CASE
      WHEN NOT t.active THEN 'neutral'
      WHEN v.value IS NULL THEN 'neutral'
      WHEN t.green_min IS NULL AND t.green_max IS NULL
       AND t.yellow_min IS NULL AND t.yellow_max IS NULL THEN 'neutral'
      WHEN t.green_min IS NOT NULL AND t.green_max IS NOT NULL
       AND v.value >= t.green_min AND v.value <= t.green_max THEN 'green'
      WHEN t.yellow_min IS NOT NULL AND t.yellow_max IS NOT NULL
       AND v.value >= t.yellow_min AND v.value <= t.yellow_max THEN 'yellow'
      ELSE 'red'
    END AS band,
    t.active,
    t.display_order,
    v.computed_at
  FROM public.metric_thresholds t
  LEFT JOIN public.marketplace_vitals v ON v.metric_key = t.metric_key
  ORDER BY t.display_order;
END;
$$;

COMMENT ON FUNCTION public.get_marketplace_vitals() IS
  'Agent OS (00301, WP-1.2): joins marketplace_vitals to metric_thresholds and computes the green/yellow/red/neutral band server-side. The admin-portal vitals route is a trivial .rpc() call — no client-side band logic. service_role only.';

REVOKE ALL ON FUNCTION public.get_marketplace_vitals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_vitals() TO service_role;

-- ─── 5. pg_cron — nightly refresh, 08:30 UTC ────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketplace-vitals-nightly') THEN
    PERFORM cron.unschedule('marketplace-vitals-nightly');
  END IF;
END $$;

SELECT cron.schedule(
  'marketplace-vitals-nightly',
  '30 8 * * *',
  $$
  SELECT public.refresh_marketplace_vitals();
  $$
);

-- ─── 6. Initial population ───────────────────────────────────────────────────
SELECT public.refresh_marketplace_vitals();
