-- ═══════════════════════════════════════════════════════════════════════════
-- 00596 — project_unbilled_time: stop dropping rows, and print the rate that
--         actually priced the line
--
-- HT-6 (W0). Two silent money defects in one view, both live:
--
--   (a) the INNER JOIN on public.profiles (00412:2685) under
--       `security_invoker = true` (00412:2672) applies the CALLER's profiles
--       RLS to the join — the row-dropping hazard 00555:3024-3026 documents in
--       its own comment. An entry whose author the caller cannot read vanishes
--       from the studio's unbilled balance, which therefore understates. The
--       join is REMOVED, not merely outer-joined: it selects no column and can
--       filter nothing, so a LEFT JOIN would leave a row-dropping shape in the
--       file for a later hand to re-tighten. The author's display name is bought
--       once, deliberately, by W2's time_entry_ledger view.
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
-- Lineage (view, name kept): 00177:97 → 00412:2671 → 00596. The NAME is
-- load-bearing — hours-ledger.tsx, the claim path and
-- supabase/tests/commercial/design_services_authority_test.sql all read it.
-- Column list, order and types are unchanged so CREATE OR REPLACE VIEW holds.
--
-- P-4: no backfill. Existing rows keep their stored amounts; this file changes
-- only what the view reports.
--
-- Renumbered 00593 -> 00596 before merge: 00592-00594 were taken by the
-- people-room CRM program (branch build/people-room-crm-2026-09-11, commit
-- 1970075c2), cut from the same head 00591 on the same day. This program is
-- the undeployed side and so it moved (patina-db-migrations step 8).
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
-- The projects join selects nothing and is NOT dead: it is the only thing that
-- keeps a project-less internal-time row (W4's nullable project_id) out of this
-- view. Do not tidy it away. profiles is joined NOT AT ALL — see the banner.
JOIN public.projects p ON p.id = te.project_id
WHERE te.invoice_id IS NULL AND te.billable
  AND te.duration_minutes IS NOT NULL AND te.billing_state = 'authorized';

COMMENT ON VIEW public.project_unbilled_time IS
  'Completed, billable, authorized, un-invoiced entries with ONE rate source: '
  'the classifier-owned snapshot on the row (te.hourly_rate_cents / '
  'te.rated_amount_cents). resolved_rate_cents is the rate that priced '
  'amount_cents — never a second chain (00596, HT-6). profiles is NOT joined at '
  'all: security_invoker applies the caller''s profiles RLS to any such join and '
  'the inner join this view used to carry silently dropped entries from the '
  'unbilled balance, while selecting nothing. The projects join stays — it is '
  'what keeps project-less internal time out of this view.';

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
  -- Stronger than asserting the join is OUTER: assert profiles is not joined at
  -- all, so no later hand can re-tighten it to an inner join.
  IF v_def LIKE '%JOIN profiles%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must not join profiles at all, got %', v_def;
  END IF;
  -- And the projects join must stay — it is the project_id IS NULL filter W4
  -- depends on once internal time exists.
  IF v_def NOT LIKE '%JOIN projects%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must keep its projects join (the project_id IS NULL filter), got %', v_def;
  END IF;
END
$postcondition$;

COMMIT;
