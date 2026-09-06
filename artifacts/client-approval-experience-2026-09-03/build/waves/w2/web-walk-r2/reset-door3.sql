-- Web walk r2 · put …cd201 back to an unsigned door so the swing can be sampled
-- at frame resolution. LOCAL ONLY; undoes this walk's own signature.
\set ON_ERROR_STOP on
\set P '''b0000000-0000-0000-0000-0000000cd201'''
BEGIN;
SET LOCAL session_replication_role = 'replica';
DELETE FROM public.invoice_line_items WHERE invoice_id IN (
  SELECT deposit_invoice_id FROM public.project_commercial_documents WHERE proposal_id = :P AND deposit_invoice_id IS NOT NULL);
UPDATE public.project_commercial_documents SET executed_at = NULL, deposit_invoice_id = NULL WHERE proposal_id = :P;
DELETE FROM public.invoices WHERE memo LIKE 'Trade scope deposit%' AND project_id='b0000000-0000-0000-0000-0000000000d1'
  AND id NOT IN (SELECT deposit_invoice_id FROM public.project_commercial_documents WHERE deposit_invoice_id IS NOT NULL);
DELETE FROM public.commercial_document_signatures WHERE proposal_id = :P;
UPDATE public.proposals SET status='sent', commercial_state='sent', signed_at=NULL,
       signed_by_name=NULL, accepted_at=NULL WHERE id = :P;
UPDATE public.trade_scope_draws SET invoice_id = NULL WHERE proposal_id = :P;
SET LOCAL session_replication_role = 'origin';
COMMIT;
SELECT id, status, commercial_state FROM public.proposals WHERE id = :P;
