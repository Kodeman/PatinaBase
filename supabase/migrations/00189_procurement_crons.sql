-- ============================================================================
-- Migration 00189: Procurement scheduled jobs (Wave 5 · ops automation)
--
-- Two pg_cron jobs with inline SQL bodies (no edge function — both are pure
-- DB work; pattern follows 00181's guarded unschedule → cron.schedule shape):
--
--   1. po-payments-due-daily (14:00 UTC daily)
--      Flips po_payments rows from 'pending' to 'due' once their due_date
--      arrives. Designers set due_date when terms are known (e.g. net_30
--      backfills delivered+30d via 00184 Trigger C); until now nothing
--      flipped state on schedule — designers flipped manually or relied on
--      the 00184 lifecycle triggers (PO shipped / deposit paid). The per-row
--      00151 trigger trg_notify_payment_due fires on each flip and creates
--      the deposit_due / balance_due / milestone_due notification.
--
--      The 90-day lower bound (due_date > CURRENT_DATE - 90) caps the
--      first-run burst on stale pre-00189 data: ancient pending rows with
--      long-past due dates would otherwise flood every designer's feed on
--      the first tick. The bound can be dropped in a later migration once
--      prod has cycled through its backlog.
--
--   2. delivery-this-week-weekly (13:00 UTC Mondays)
--      Arms the delivery_this_week notification kind that 00151 RESERVED
--      ("no trigger in v1 … intended for a weekly pg_cron job"). Scans
--      purchase_orders.confirmed_eta for deliveries landing within the next
--      7 days (today..today+6) on POs that are still in flight, and inserts
--      one procurement_notifications row per PO addressed to the owning
--      designer. A NOT EXISTS dedupe on (kind, subject_purchase_order_id)
--      within the last 7 days keeps an unchanged ETA from re-notifying every
--      week if the schedule ever tightens, and makes the job body idempotent
--      within a week.
--
-- Both bodies schema-qualify every relation: pg_cron runs jobs under the
-- scheduling role's default search_path, not the migration's.
--
-- Interaction notes:
--   * 00184 Trigger D (trg_deposit_paid_flips_balance) is gated
--     WHEN (NEW.state = 'paid'), so the pending→due flip never re-triggers it.
--   * The flip UPDATE only touches `state`, so chk_paid_date_required_when_paid
--     and the net_30 due-date backfill are unaffected.
--
-- ⚠ The two job bodies are copied VERBATIM into
--   supabase/tests/procurement/crons_test.sql (pg_cron can't tick inside a
--   test transaction). If you change a body here, update the test.
--
-- Re-run safe: guarded unschedule-if-exists before each schedule (00181 idiom).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ─── JOB 1: po-payments-due-daily ────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'po-payments-due-daily') THEN
    PERFORM cron.unschedule('po-payments-due-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'po-payments-due-daily',
  '0 14 * * *',
  $$
  UPDATE public.po_payments
     SET state = 'due'
   WHERE state = 'pending'
     AND due_date IS NOT NULL
     AND due_date <= CURRENT_DATE
     -- 90-day lower bound: caps the first-run burst on stale pre-00189 data.
     -- Drop in a later migration once prod has cycled.
     AND due_date > CURRENT_DATE - 90;
  $$
);

-- ─── JOB 2: delivery-this-week-weekly ────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-this-week-weekly') THEN
    PERFORM cron.unschedule('delivery-this-week-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'delivery-this-week-weekly',
  '0 13 * * 1',
  $$
  INSERT INTO public.procurement_notifications (user_id, kind, subject_purchase_order_id)
  SELECT po.designer_id,
         'delivery_this_week'::public.procurement_notification_kind,
         po.id
    FROM public.purchase_orders po
   WHERE po.confirmed_eta BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
     AND po.status NOT IN ('delivered', 'cancelled')
     AND NOT EXISTS (
       SELECT 1
         FROM public.procurement_notifications n
        WHERE n.subject_purchase_order_id = po.id
          AND n.kind = 'delivery_this_week'
          AND n.created_at > NOW() - INTERVAL '7 days'
     );
  $$
);

-- ─── COMMENT REFRESH: delivery_this_week is no longer reserved ───────────────
--
-- 00151 marked the kind RESERVED ("no trigger in v1 … do not render in the UI
-- feed"). It is now armed by the weekly job above; the UI may render it.

COMMENT ON TYPE procurement_notification_kind IS
  'In-app notification kinds for the procurement workspace. '
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to ''due'' from a non-due state '
  '(00184 lifecycle triggers, manual flips, or the daily po-payments-due-daily pg_cron job from 00189). '
  'delivery_this_week: ARMED in 00189 (was RESERVED in 00151) — produced by the delivery-this-week-weekly pg_cron job '
  '(Mondays 13:00 UTC) scanning purchase_orders.confirmed_eta within the next 7 days on in-flight POs, '
  'deduped per PO over a rolling 7 days. The UI may render it. '
  'damage_claim_drafted: fired on INSERT into damage_claims with state = ''drafted''.';

-- ─── pg_cron EXTENSION COMMENT (best-effort, 00181 idiom) ────────────────────
--
-- pg_cron is owned by supabase_admin on self-hosted, so a postgres-run
-- migration may lack privilege — same guard as 00092 / 00174 / 00181.

DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: decision-reminders-daily (09:00 UTC), expire-decisions-daily (02:00 UTC), invoice-reminders-daily (15:00 UTC, A/R cadence via the invoice-reminders edge fn), po-payments-due-daily (14:00 UTC, pending→due flips), delivery-this-week-weekly (Mon 13:00 UTC, confirmed_eta scan), review-requests cron, proposal cron.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
