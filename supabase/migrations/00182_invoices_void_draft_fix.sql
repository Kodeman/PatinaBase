-- 00182: allow voiding a never-issued draft invoice.
--
-- 00178's chk_invoices_number_when_issued required every non-draft status to
-- carry an invoice_number, but invoice numbers are only assigned at issue
-- time — so void_invoice() on a draft (a flow the UI offers and the RPC's
-- guards permit) blew up with 23514. Caught by e2e
-- (time-tracking.spec.ts: "voiding the draft releases the time entries").
--
-- 'void' joins 'draft' as a status that may be unnumbered; voided drafts are
-- kept as audit rows. Issued invoices that get voided retain their number.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_number_when_issued;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_number_when_issued
    CHECK (status IN ('draft', 'void') OR invoice_number IS NOT NULL);
