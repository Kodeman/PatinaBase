-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00245: product_behavior_stats — the F10 behavioral matview
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §5.5
-- (matview DDL + Laplace smoothing) · §12.2 (nightly refresh row) · §11
-- (Loop 1/4 substrate).
-- (§15.4 row "00245 behavior_stats" — replaces the G0 reservation in place.)
--
-- What this ships:
--   1. The product_behavior_stats materialized view: view/save/skip counts +
--      the Laplace-smoothed save rate (saves+2)/(views+20). The prior means
--      unseen products inherit 0.1 — the behavioral term can never bury a
--      new piece (§5.5 anti-runaway guardrail, structural). The match RPC
--      (00244) reads it with a 0.5 cold default after its /0.2 affine
--      calibration, so no-row and prior-row agree.
--   2. UNIQUE index on product_id (required by REFRESH ... CONCURRENTLY).
--   3. refresh_product_behavior_stats() — transaction-safe (non-concurrent)
--      helper for jobs/tests (service_role only).
--   4. Nightly pg_cron refresh (guarded-unschedule string-body idiom,
--      00081/00092/00189/00241 precedent). The cron body is the BARE
--      REFRESH ... CONCURRENTLY statement — CONCURRENTLY cannot run inside
--      a function/transaction block, and pg_cron executes its command as a
--      top-level statement, which is exactly where it is allowed.
--
-- Documented deviations (flagged to the conductor):
--   • interactions.product_id is TEXT (00067, iOS legacy) — rows are cast
--     to uuid behind a regex guard; non-uuid ids (if any legacy junk lands)
--     are excluded rather than crashing the refresh.
--   • Scheduled at 03:20 as a standalone cron; Wave 4A's aesthete-nightly
--     (02:30, §12.2 phase 4) may consolidate it — keep the job name.
--   • Matview grants: service_role + postgres only. Portal surfaces never
--     read it directly; the DEFINER match RPC does.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW product_behavior_stats AS
SELECT i.product_id::uuid AS product_id,
       count(*) FILTER (WHERE i.event_type = 'view')  AS views,
       count(*) FILTER (WHERE i.event_type = 'save')  AS saves,
       count(*) FILTER (WHERE i.event_type = 'skip')  AS skips,
       ((count(*) FILTER (WHERE i.event_type = 'save') + 2.0)
         / (count(*) FILTER (WHERE i.event_type = 'view') + 20.0))::real AS smoothed_save_rate
FROM interactions i
WHERE i.product_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
GROUP BY i.product_id::uuid;

COMMENT ON MATERIALIZED VIEW product_behavior_stats IS
  'F10 derived behavioral stats (design §5.5): Laplace-smoothed save rate (saves+2)/(views+20) per product from the interactions stream. Refreshed nightly (aesthete-behavior-stats cron, CONCURRENTLY). Never stored in product_dna — always derived. Read by get_aesthete_matches (T_behavioral) with a 0.5 cold default.';

-- REFRESH ... CONCURRENTLY requires a unique index.
CREATE UNIQUE INDEX ux_product_behavior_stats ON product_behavior_stats (product_id);

REVOKE ALL ON product_behavior_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON product_behavior_stats TO service_role;

-- Transaction-safe refresh for jobs/tests (non-concurrent — callable from
-- functions; the cron path below stays CONCURRENTLY for lock-free reads).
CREATE OR REPLACE FUNCTION refresh_product_behavior_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  REFRESH MATERIALIZED VIEW product_behavior_stats;
END $fn$;

COMMENT ON FUNCTION refresh_product_behavior_stats() IS
  'Non-concurrent refresh of product_behavior_stats for jobs/tests (design §12.2). The nightly cron refreshes CONCURRENTLY as a bare top-level statement instead.';

REVOKE ALL ON FUNCTION refresh_product_behavior_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_product_behavior_stats() TO service_role;

-- Nightly refresh (guarded-unschedule string-body idiom).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-behavior-stats') THEN
    PERFORM cron.unschedule('aesthete-behavior-stats');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-behavior-stats',
  '20 3 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.product_behavior_stats;$$
);
