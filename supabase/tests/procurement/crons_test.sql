-- ═══════════════════════════════════════════════════════════════════════════
-- Procurement scheduled-job tests (migration 00189)
--
-- pg_cron can't tick inside a test transaction, so this suite executes the
-- two job SQL BODIES directly — copied VERBATIM from
-- supabase/migrations/00189_procurement_crons.sql.
-- ⚠ If a job body changes in the migration, update the copies here.
--
-- Cases:
--   1. po-payments-due-daily body:
--      a. pending + due_date = today      → flipped to 'due' + notification
--         row from the 00151 trg_notify_payment_due trigger.
--      b. pending + due_date = yesterday  → flipped (still inside the window).
--      c. pending + due_date = today-200d → NOT flipped (beyond the 90-day
--         first-run-burst bound).
--      d. pending + due_date = tomorrow   → NOT flipped.
--      e. paid row with past due_date     → untouched.
--      f. already-due row                 → untouched, no extra notification.
--      g. pending + due_date NULL         → untouched.
--   2. delivery-this-week-weekly body:
--      a. PO in_production, confirmed_eta = today+3 → notification created.
--      b. Re-run the same body → NO duplicate (7-day dedupe).
--      c. PO delivered / cancelled with eta in window → none.
--      d. PO confirmed with eta outside the window (today+10 / yesterday /
--         NULL) → none.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/crons_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. It runs as superuser — the
-- focus is the job SQL + 00151 trigger interplay, not RLS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('88888888-8888-4888-8888-888888888888', 'crons-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('88888888-8888-4888-8888-888888888888', 'crons-designer@test.invalid', 'Crons Test Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('cccc0000-0000-4000-8000-000000000001', 'Crons Test Project', '88888888-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888888');

INSERT INTO vendors (id, name)
VALUES ('cccc0000-0000-4000-8000-000000000002', 'Crons Test Vendor');

-- Purchase orders:
--   PO-P  confirmed     — host for the payment-flip cases (confirmed_eta NULL
--                         so it never matches the weekly scan)
--   PO-W1 in_production — eta today+3  → weekly notification (cases 2a/2b)
--   PO-W2 delivered     — eta today+3  → excluded by status
--   PO-W3 cancelled     — eta today+3  → excluded by status
--   PO-W4 confirmed     — eta today+10 → outside window
--   PO-W5 shipped       — eta yesterday → outside window (past)
--   PO-W6 confirmed     — eta NULL     → excluded (BETWEEN on NULL)
-- Status is set at INSERT, so the 00184 cascade triggers (UPDATE-only) stay
-- quiet at fixture time.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, confirmed_eta)
VALUES
  ('c0000000-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'custom_milestones', 100000, 'confirmed',     NULL),
  ('c0000000-0000-4000-8000-000000000011', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'in_production', CURRENT_DATE + 3),
  ('c0000000-0000-4000-8000-000000000012', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'delivered',     CURRENT_DATE + 3),
  ('c0000000-0000-4000-8000-000000000013', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'cancelled',     CURRENT_DATE + 3),
  ('c0000000-0000-4000-8000-000000000014', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'confirmed',     CURRENT_DATE + 10),
  ('c0000000-0000-4000-8000-000000000015', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'shipped',       CURRENT_DATE - 1),
  ('c0000000-0000-4000-8000-000000000016', '88888888-8888-4888-8888-888888888888', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002', 'full_upfront',     100000, 'confirmed',     NULL);

-- Payments (all on PO-P). INSERTed at their target states — the 00151 notify
-- trigger and 00184 Trigger D are both UPDATE-only, so nothing fires here.
--   pay-1 pending, due today      → 1a: flips
--   pay-2 pending, due yesterday  → 1b: flips (inside window)
--   pay-3 pending, due today-200d → 1c: NOT flipped (beyond 90d bound)
--   pay-4 pending, due tomorrow   → 1d: NOT flipped
--   pay-5 paid,    due yesterday  → 1e: untouched (paid_date satisfies
--                                       chk_paid_date_required_when_paid)
--   pay-6 due,     due yesterday  → 1f: untouched, no new notification
--   pay-7 pending, due NULL       → 1g: untouched
INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, due_date, paid_date)
VALUES
  ('c2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'balance',   10000, 'pending', CURRENT_DATE,       NULL),
  ('c2000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'milestone', 10000, 'pending', CURRENT_DATE - 1,   NULL),
  ('c2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'milestone', 10000, 'pending', CURRENT_DATE - 200, NULL),
  ('c2000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'balance',   10000, 'pending', CURRENT_DATE + 1,   NULL),
  ('c2000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'deposit',   10000, 'paid',    CURRENT_DATE - 1,   CURRENT_DATE),
  ('c2000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'milestone', 10000, 'due',     CURRENT_DATE - 1,   NULL),
  ('c2000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'balance',   10000, 'pending', NULL,               NULL);

-- ─── case 1: po-payments-due-daily body ──────────────────────────────────────
--
-- ▼▼ VERBATIM job body from 00189 (job 'po-payments-due-daily') ▼▼
UPDATE public.po_payments
   SET state = 'due'
 WHERE state = 'pending'
   AND due_date IS NOT NULL
   AND due_date <= CURRENT_DATE
   -- 90-day lower bound: caps the first-run burst on stale pre-00189 data.
   -- Drop in a later migration once prod has cycled.
   AND due_date > CURRENT_DATE - 90;
-- ▲▲ VERBATIM job body ▲▲

DO $$
DECLARE
  v_state po_payment_state;
  v_count INTEGER;
BEGIN
  -- 1a: due today → flipped + notification (00151 trigger, kind balance → balance_due)
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000001';
  ASSERT v_state = 'due',
    'FAIL 1a-i: pending payment due today should flip to due, got ' || v_state;
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_payment_id = 'c2000000-0000-4000-8000-000000000001' AND kind = 'balance_due';
  ASSERT v_count = 1,
    'FAIL 1a-ii: flip should create exactly one balance_due notification (00151 trigger), got ' || v_count;

  -- 1b: due yesterday (inside 90d window) → flipped + milestone_due notification
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000002';
  ASSERT v_state = 'due',
    'FAIL 1b-i: pending payment due yesterday should flip to due, got ' || v_state;
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_payment_id = 'c2000000-0000-4000-8000-000000000002' AND kind = 'milestone_due';
  ASSERT v_count = 1,
    'FAIL 1b-ii: flip should create exactly one milestone_due notification, got ' || v_count;

  -- 1c: due 200 days ago → beyond the 90d bound, NOT flipped, no notification
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000003';
  ASSERT v_state = 'pending',
    'FAIL 1c-i: payment 200d overdue is beyond the 90d bound and must stay pending, got ' || v_state;
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_payment_id = 'c2000000-0000-4000-8000-000000000003';
  ASSERT v_count = 0,
    'FAIL 1c-ii: unflipped stale payment must not notify, got ' || v_count;

  -- 1d: due tomorrow → NOT flipped
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000004';
  ASSERT v_state = 'pending',
    'FAIL 1d: payment due tomorrow must stay pending, got ' || v_state;

  -- 1e: paid row untouched
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000005';
  ASSERT v_state = 'paid',
    'FAIL 1e: paid payment must stay paid, got ' || v_state;

  -- 1f: already-due row untouched, no notification (never transitioned here)
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000006';
  ASSERT v_state = 'due',
    'FAIL 1f-i: already-due payment must stay due, got ' || v_state;
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_payment_id = 'c2000000-0000-4000-8000-000000000006';
  ASSERT v_count = 0,
    'FAIL 1f-ii: already-due payment must not gain a notification, got ' || v_count;

  -- 1g: NULL due_date → NOT flipped
  SELECT state INTO v_state FROM po_payments WHERE id = 'c2000000-0000-4000-8000-000000000007';
  ASSERT v_state = 'pending',
    'FAIL 1g: pending payment with NULL due_date must stay pending, got ' || v_state;

  RAISE NOTICE 'Case 1 passed: daily body flips only pending payments due within the 90-day window (+ 00151 notifications).';
END
$$;

-- ─── case 2: delivery-this-week-weekly body ──────────────────────────────────
--
-- ▼▼ VERBATIM job body from 00189 (job 'delivery-this-week-weekly') ▼▼
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
-- ▲▲ VERBATIM job body ▲▲

DO $$
DECLARE
  v_count   INTEGER;
  v_user_id UUID;
BEGIN
  -- 2a: in-flight PO with eta in 3 days → exactly one notification, addressed
  --     to the owning designer.
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_purchase_order_id = 'c0000000-0000-4000-8000-000000000011'
     AND kind = 'delivery_this_week';
  ASSERT v_count = 1,
    'FAIL 2a-i: in_production PO with eta today+3 should get one delivery_this_week notification, got ' || v_count;
  SELECT user_id INTO v_user_id FROM procurement_notifications
   WHERE subject_purchase_order_id = 'c0000000-0000-4000-8000-000000000011'
     AND kind = 'delivery_this_week';
  ASSERT v_user_id = '88888888-8888-4888-8888-888888888888',
    'FAIL 2a-ii: notification should be addressed to the PO designer, got ' || v_user_id;

  RAISE NOTICE 'Case 2a passed: eta-in-window in-flight PO notifies the designer.';
END
$$;

-- 2b: re-run the same body → the 7-day dedupe suppresses a duplicate.
-- ▼▼ VERBATIM job body from 00189 (job 'delivery-this-week-weekly') ▼▼
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
-- ▲▲ VERBATIM job body ▲▲

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_purchase_order_id = 'c0000000-0000-4000-8000-000000000011'
     AND kind = 'delivery_this_week';
  ASSERT v_count = 1,
    'FAIL 2b: re-running the weekly body must not duplicate (7-day dedupe), got ' || v_count;

  -- 2c: delivered / cancelled POs with eta in window → no notification
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_purchase_order_id IN
         ('c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000013')
     AND kind = 'delivery_this_week';
  ASSERT v_count = 0,
    'FAIL 2c: delivered/cancelled POs must not notify, got ' || v_count;

  -- 2d: eta outside the window (today+10 / yesterday / NULL) → no notification
  SELECT COUNT(*) INTO v_count FROM procurement_notifications
   WHERE subject_purchase_order_id IN
         ('c0000000-0000-4000-8000-000000000014',
          'c0000000-0000-4000-8000-000000000015',
          'c0000000-0000-4000-8000-000000000016')
     AND kind = 'delivery_this_week';
  ASSERT v_count = 0,
    'FAIL 2d: POs with eta outside today..today+6 (or NULL) must not notify, got ' || v_count;

  RAISE NOTICE 'Case 2 passed: weekly body dedupes and respects status/window filters.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All procurement cron assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
