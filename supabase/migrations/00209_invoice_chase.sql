-- 00209: The Accounts book's dunning chase (R36).
--
-- The Accounts book (a Drawer Sheet) carries Receivables — A/R aging plus the
-- "send the reminder / chase" dunning act. R36 ties that act to the Desk: an
-- overdue receivable rises on the Desk as a need line, and one act clears both
-- surfaces. For "clears" to be true, chasing has to leave a mark the Desk can
-- read so the need drops once the act is taken (the R22 awareness tier — once
-- chased, the only available act is over, until the cooldown lapses).
--
-- The automated invoice-reminders cadence owns `reminder_count` /
-- `last_reminder_at` / `ar_flagged_at` (a manual nudge must NOT perturb that
-- cadence — see use-invoices useSendInvoice type:'reminder'). So the designer's
-- own hand needs its OWN timestamp: `ar_last_chased_at`. The Receivables page's
-- dunning act stamps it (alongside the reminder email); the Desk's receivables
-- derivation gates the need on "overdue AND not chased within the cooldown".
--
-- Additive and non-destructive (R21 / D7): NULL is the ordinary state, and the
-- automated cadence columns are untouched.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ar_last_chased_at TIMESTAMPTZ;

COMMENT ON COLUMN public.invoices.ar_last_chased_at IS
  'When the designer last manually chased this receivable (R36, the Accounts '
  'book Receivables page). Distinct from the automated cadence''s last_reminder_at '
  '/ ar_flagged_at — a manual chase never perturbs that cadence. The Desk gates '
  'the overdue-invoice need on this (overdue AND not chased within the cooldown).';

-- chase_invoice: stamp ar_last_chased_at = now() for an invoice the caller owns.
-- SECURITY DEFINER with an explicit ownership guard (designer_id = auth.uid())
-- so the stamp lands even though sent/issued invoices are otherwise update-locked
-- by RLS. Returns the new timestamp (or NULL when the invoice isn't the caller's).
CREATE OR REPLACE FUNCTION public.chase_invoice(p_invoice_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp TIMESTAMPTZ := now();
  v_owner UUID;
  v_status TEXT;
BEGIN
  SELECT designer_id, status INTO v_owner, v_status
    FROM public.invoices WHERE id = p_invoice_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN NULL;  -- not the caller's invoice (or it doesn't exist): no-op
  END IF;
  -- Chasing is only meaningful for an open receivable. Guard server-side too,
  -- so a direct RPC call can't stamp a paid/void/draft invoice (the JS gates on
  -- overdue, but this RPC is reachable on its own).
  IF v_status NOT IN ('sent', 'partially_paid') THEN
    RETURN NULL;
  END IF;

  UPDATE public.invoices
     SET ar_last_chased_at = v_stamp
   WHERE id = p_invoice_id;

  RETURN v_stamp;
END;
$$;

COMMENT ON FUNCTION public.chase_invoice(UUID) IS
  'R36: stamp ar_last_chased_at for an overdue receivable the caller owns, when '
  'the designer manually chases it from the Accounts book Receivables page. The '
  'Desk''s overdue-invoice need clears on the next read.';

REVOKE ALL ON FUNCTION public.chase_invoice(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chase_invoice(UUID) TO authenticated;
