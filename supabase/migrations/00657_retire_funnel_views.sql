-- ═══════════════════════════════════════════════════════════════════════════
-- 00657 — Retire the three funnel readout views
-- Lineage: 00038 (created conversion_funnel, designer_funnel, consumer_funnel)
--          → 00107 (redefined conversion_funnel, FULL JOIN repair)
--          → 00555 (revoked anon/authenticated, granted service_role)
--          → 00657 (this file: drop all three)
-- Reconciles: nothing. These are pure read-only aggregate views over
--   profiles / engagement_events / waitlist. They carry no rows of their own,
--   so dropping them destroys no data.
--
-- Why: the studio-hook program (Deploy 1, row H1) retires the funnel readouts.
--   They report signup/conversion counts the studio surface is explicitly not
--   optimized for, and their admin display is removed in the same change.
--   Readers retired alongside this migration:
--     apps/admin-portal/src/app/api/admin/decision-analytics/route.ts
--     apps/admin-portal/src/components/analytics/funnel-chart.tsx (deleted)
--     packages/supabase/src/hooks/use-insights.ts (three hooks)
--
-- Each view is dropped on its own, and nothing is swept along with it. A
--   pg_depend read on the local replay showed no dependent views, functions,
--   matviews, rules, or default expressions on any of the three (only their own
--   columns and the service_role ACL entries). If a dependent is ever added,
--   this migration must fail loudly rather than quietly remove it.
--
-- Grants: DROP VIEW removes the object's ACL with it, so the 00555 REVOKE/GRANT
--   lines for these three views need no counterpart here, and this migration
--   adds no GRANT/REVOKE of its own — seed/00-legacy-grants.sql therefore does
--   not need regenerating. Its existing blocks for these views are already
--   wrapped in `EXCEPTION WHEN undefined_table ... THEN NULL`, so a replay
--   against a database where the views are gone is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.designer_funnel;
DROP VIEW IF EXISTS public.conversion_funnel;
DROP VIEW IF EXISTS public.consumer_funnel;
