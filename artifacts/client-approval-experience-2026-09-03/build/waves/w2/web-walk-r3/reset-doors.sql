-- Web walk r3 · put the three trade-scope doors back to unsigned so the swing,
-- the receipt and the 390px act dock can be walked again. LOCAL ONLY; undoes
-- round 2's own signatures on these papers.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = 'replica';
DELETE FROM public.invoice_line_items WHERE invoice_id IN (
  SELECT deposit_invoice_id FROM public.project_commercial_documents
   WHERE proposal_id IN ('b0000000-0000-0000-0000-0000000cd201',
                         'b0000000-0000-0000-0000-0000000cd202',
                         'b0000000-0000-0000-0000-0000000cd102')
     AND deposit_invoice_id IS NOT NULL);
DELETE FROM public.invoices WHERE id IN (
  SELECT deposit_invoice_id FROM public.project_commercial_documents
   WHERE proposal_id IN ('b0000000-0000-0000-0000-0000000cd201',
                         'b0000000-0000-0000-0000-0000000cd202',
                         'b0000000-0000-0000-0000-0000000cd102')
     AND deposit_invoice_id IS NOT NULL);
UPDATE public.project_commercial_documents SET executed_at = NULL, deposit_invoice_id = NULL
 WHERE proposal_id IN ('b0000000-0000-0000-0000-0000000cd201',
                       'b0000000-0000-0000-0000-0000000cd202',
                       'b0000000-0000-0000-0000-0000000cd102');
DELETE FROM public.commercial_document_signatures
 WHERE proposal_id IN ('b0000000-0000-0000-0000-0000000cd201',
                       'b0000000-0000-0000-0000-0000000cd202',
                       'b0000000-0000-0000-0000-0000000cd102');
UPDATE public.proposals SET status='sent', commercial_state='sent', signed_at=NULL,
       signed_by_name=NULL, accepted_at=NULL
 WHERE id IN ('b0000000-0000-0000-0000-0000000cd201',
              'b0000000-0000-0000-0000-0000000cd202',
              'b0000000-0000-0000-0000-0000000cd102');
UPDATE public.trade_scope_draws SET invoice_id = NULL
 WHERE proposal_id IN ('b0000000-0000-0000-0000-0000000cd201',
                       'b0000000-0000-0000-0000-0000000cd202',
                       'b0000000-0000-0000-0000-0000000cd102');
SET LOCAL session_replication_role = 'origin';
COMMIT;
SELECT id, left(title,34) t, status, commercial_state FROM public.proposals
 WHERE id IN ('b0000000-0000-0000-0000-0000000cd201',
              'b0000000-0000-0000-0000-0000000cd202',
              'b0000000-0000-0000-0000-0000000cd102') ORDER BY id;
