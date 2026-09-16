-- W4 r9 BLOCKING-1 — the guard that was down at the moment the payer needed it.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f <this file>
-- One transaction, ROLLBACKed. Seeded invoice b0…e142, status 'sent'.
BEGIN;

-- the address in the letter the client holds
SELECT public.ensure_invoice_link('b0000000-0000-0000-0000-00000000e142') AS letter_token \gset

SELECT id AS link_id, token_hash AS link_hash
  FROM public.invoice_links
 WHERE invoice_id = 'b0000000-0000-0000-0000-00000000e142' AND status = 'active' \gset

-- she opened /pay/<token>, paid, and Stripe settled: settle_invoice_checkout_payment
-- flips invoice_payments.status, 00428's sync trigger mirrors 'succeeded' onto
-- the attempt in the same statement — BEFORE stripe-webhook asks for the
-- receipt's address.
INSERT INTO public.invoice_checkout_attempts
  (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
   currency, state, stripe_idempotency_key, stripe_checkout_session_id,
   return_nonce, finalized_at)
VALUES ('b0000000-0000-0000-0000-00000000e142', NULL, :'link_id', 'cus_r9_probe',
        12345, 'usd', 'succeeded', 'idem_r9_probe', 'cs_r9_probe',
        repeat('c', 64), now());

-- THE OLD GUARD vs THE FIXED ONE, on the same row
SELECT
  EXISTS (SELECT 1 FROM public.invoice_checkout_attempts
           WHERE invoice_id = 'b0000000-0000-0000-0000-00000000e142'
             AND state IN ('claimed','session_created','processing'))       AS old_guard_holds,
  EXISTS (SELECT 1 FROM public.invoice_checkout_attempts
           WHERE invoice_id = 'b0000000-0000-0000-0000-00000000e142'
             AND (state IN ('claimed','session_created','processing')
                  OR (invoice_link_id IS NOT NULL
                      AND state IN ('succeeded','failed','requires_refund')
                      AND COALESCE(finalized_at, updated_at, created_at)
                            > now() - interval '24 hours')))                AS fixed_guard_holds;

-- the receipt letter asks for an address (stripe-webhook's first act)
SELECT public.ensure_invoice_link('b0000000-0000-0000-0000-00000000e142') IS NULL
         AS letter_falls_back_rather_than_rotating;

SELECT status, token_hash = :'link_hash' AS still_the_payers_address
  FROM public.invoice_links
 WHERE invoice_id = 'b0000000-0000-0000-0000-00000000e142'
 ORDER BY created_at DESC;

-- her /pay address still opens, and her return still lands on her own sheet
SELECT public.resolve_invoice_link(:'letter_token', false) IS NOT NULL AS pay_address_opens;
SELECT public.resolve_invoice_return_nonce(repeat('c', 64))->>'state' AS return_state;
SELECT public.resolve_invoice_return_nonce(repeat('c', 64))->>'state' AS replayed_state;

ROLLBACK;
