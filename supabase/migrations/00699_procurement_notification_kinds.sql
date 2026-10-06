-- ═══════════════════════════════════════════════════════════════════════════
-- 00699 — Procurement notification kinds for notices that carry an act
--         (US-16 Phase 1, C-22; SQ-403)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M8. Six new procurement_notification_kind values, one per Desk act:
--   claim_window_closing   "Notify the vendor"    (written by 00700's
--                                                  procurement-clocks-daily)
--   ack_discrepancy        "Answer the vendor"    (Phase 2)
--   quote_expiring         "Reconfirm the price"  (Phase 2)
--   cfa_reserve_expiring   "Approve the CFA"      (Phase 2)
--   memo_return_due        "Mark returned"        (Phase 2)
--   backorder_reported     "Choose a path"        (Phase 2)
--
-- A file of its own: a value added by ALTER TYPE … ADD VALUE cannot be used
-- in the transaction that adds it (the 00174 / 00228 / 00275 split). 00700
-- uses claim_window_closing.
--
-- After this file the enum holds 14 values: 00151's five, 00275's
-- payment_received and payment_failed, 00277's payment_refunded, and these
-- six. No GRANT/REVOKE.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'claim_window_closing';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'ack_discrepancy';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'quote_expiring';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'cfa_reserve_expiring';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'memo_return_due';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'backorder_reported';

COMMENT ON TYPE public.procurement_notification_kind IS
  'In-app notification kinds for the procurement workspace. '
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to ''due'' from a non-due state '
  '(00184 lifecycle triggers, manual flips, or the daily po-payments-due-daily pg_cron job from 00189). '
  'delivery_this_week: the delivery-this-week-weekly pg_cron job (00189, Mondays 13:00 UTC). '
  'damage_claim_drafted: fired on INSERT into damage_claims with state = ''drafted''. '
  'payment_received / payment_failed (00275) and payment_refunded (00277): written by stripe-webhook on the catalog rail. '
  'claim_window_closing (00699): written by procurement-clocks-daily (00700) the day before a vendor claim window '
  'closes on a PO with an unnotified damage claim. '
  'ack_discrepancy, quote_expiring, cfa_reserve_expiring, memo_return_due, backorder_reported (00699): reserved for '
  'the Phase 2 scans of procurement-clocks-daily. The SQL writers address the PO creator and the project lead, '
  'deduped (procurement_notice_recipients, 00700).';
