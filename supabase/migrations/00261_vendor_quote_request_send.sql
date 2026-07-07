-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00261: vendor_quote_requests.sent_at — RFQ dispatch stamp
--
-- The quote-request-send edge function (modeled structurally on po-send)
-- delivers the vendor RFQ email that migration 00162's comment deferred to a
-- "downstream job" which never existed. On a successful send it flips
-- status → 'sent' AND stamps sent_at, mirroring purchase_orders.sent_at
-- (00188): NULL = never dispatched.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS). The pre-existing
-- insert-only VEN-01 flow keeps working untouched; rows written before this
-- migration simply carry sent_at = NULL.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vendor_quote_requests
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.vendor_quote_requests.sent_at IS
  'When the RFQ email was dispatched to the vendor by the quote-request-send '
  'edge function; status flips to ''sent'' in the same write. NULL = never '
  'sent — a draft composed but not yet dispatched (e.g. no vendor email on '
  'file at send time).';
