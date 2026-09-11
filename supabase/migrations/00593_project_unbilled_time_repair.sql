-- ═══════════════════════════════════════════════════════════════════════════
-- 00593 — project_unbilled_time: stop dropping rows, and print the rate that
--         actually priced the line
--
-- HT-6 (W0). Two silent money defects in one view, both live:
--
--   (a) the INNER JOIN on public.profiles (00412:2685) under
--       `security_invoker = true` (00412:2672) applies the CALLER's profiles
--       RLS to the join — the row-dropping hazard 00555:3024-3026 documents in
--       its own comment. An entry whose author the caller cannot read vanishes
--       from the studio's unbilled balance, which therefore understates. The
--       join becomes a LEFT JOIN.
--
--   (b) resolved_rate_cents read the legacy chain
--       (te.hourly_rate_cents → projects.change_order_terms →
--        profiles.default_hourly_rate_cents → 0, 00412:2675-2678) while
--       amount_cents prefers te.rated_amount_cents (00412:2679-2681) — so the
--       rate printed beside an amount did not price that amount. Both columns
--       now read ONE source: the classifier-owned te.hourly_rate_cents /
--       te.rated_amount_cents snapshot on the row. `change_order_terms` (whose
--       only writer is the legacy scope builder) and
--       profiles.default_hourly_rate_cents (which has no writer anywhere) are
--       cut as rate legs here; the profiles COLUMN is deliberately NOT dropped
--       (HT-2 is unruled — plan-v2 §2).
--
-- Lineage (view, name kept): 00177:97 → 00412:2671 → 00593. The NAME is
-- load-bearing — hours-ledger.tsx, the claim path and
-- supabase/tests/commercial/design_services_authority_test.sql all read it.
-- Column list, order and types are unchanged so CREATE OR REPLACE VIEW holds.
--
-- P-4: no backfill. Existing rows keep their stored amounts; this file changes
-- only what the view reports.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.project_unbilled_time
WITH (security_invoker = true) AS
SELECT
  te.id, te.project_id, te.phase_key, te.task_id, te.user_id, te.started_at,
  te.duration_minutes, te.notes,
  COALESCE(te.hourly_rate_cents, 0) AS resolved_rate_cents,
  COALESCE(te.rated_amount_cents,
    round(te.duration_minutes / 60.0 * COALESCE(te.hourly_rate_cents, 0))::int
  ) AS amount_cents,
  te.billing_authority_id, te.authority_rate_id, te.billing_state
FROM public.project_time_entries te
JOIN public.projects p ON p.id = te.project_id
LEFT JOIN public.profiles pr ON pr.id = te.user_id
WHERE te.invoice_id IS NULL AND te.billable
  AND te.duration_minutes IS NOT NULL AND te.billing_state = 'authorized';

COMMENT ON VIEW public.project_unbilled_time IS
  'Completed, billable, authorized, un-invoiced entries with ONE rate source: '
  'the classifier-owned snapshot on the row (te.hourly_rate_cents / '
  'te.rated_amount_cents). resolved_rate_cents is the rate that priced '
  'amount_cents — never a second chain (00593, HT-6). profiles is LEFT JOINed '
  'because security_invoker applies the caller''s profiles RLS to the join and '
  'an inner join silently dropped entries from the unbilled balance.';

-- Postcondition: the repair is structural, so assert the structure rather than
-- a fixture — the join type and the absence of the legacy rate legs.
DO $postcondition$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_viewdef('public.project_unbilled_time'::regclass, true) INTO v_def;

  IF v_def LIKE '%change_order_terms%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time still reads change_order_terms as a rate leg';
  END IF;
  IF v_def LIKE '%default_hourly_rate_cents%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time still reads profiles.default_hourly_rate_cents as a rate leg';
  END IF;
  IF v_def NOT LIKE '%LEFT JOIN profiles%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must LEFT JOIN profiles, got %', v_def;
  END IF;
END
$postcondition$;

COMMIT;
