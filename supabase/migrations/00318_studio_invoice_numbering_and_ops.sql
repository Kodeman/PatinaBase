-- ═══════════════════════════════════════════════════════════════════════════
-- 00318 — Per-studio invoice numbering + co-member issue/record
--
-- Invoice numbering was per-designer (invoice_counters + issue_invoice, 00178):
-- two members of one studio both start at INV-0001 and collide under one brand.
-- This adds a per-studio counter and a snapshotted invoices.studio_id, and lets
-- any co-member issue/record under the studio brand.
--
-- Lineage:
--   issue_invoice          — 00178 (head; not since redefined) → 00318
--   record_invoice_payment — 00178 (head; not since redefined) → 00318
--   void_invoice           — head 00187, NOT touched here (owner-only stays).
-- Both bodies grafted VERBATIM from 00178 with exactly the documented deltas.
--
-- MUST run after 00317 (the invoices backfill reads projects.studio_id).
-- Adds function re-grants → regenerate seed/00-legacy-grants.sql after this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. invoices.studio_id (snapshot of the issuing studio) ──────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_studio
  ON public.invoices(studio_id) WHERE studio_id IS NOT NULL;

-- ─── 2. BEFORE INSERT trigger — keeps hooks unchanged (they never set studio_id)
CREATE OR REPLACE FUNCTION public.set_invoice_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.studio_id IS NULL THEN
    NEW.studio_id := COALESCE(
      (SELECT p.studio_id FROM projects p WHERE p.id = NEW.project_id),
      public._primary_studio_for(NEW.designer_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_invoice_studio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_studio_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS set_invoice_studio_id ON public.invoices;
CREATE TRIGGER set_invoice_studio_id
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_studio_id();

-- ─── 3. Backfill existing invoices (after 00317 populated projects.studio_id) ─
UPDATE public.invoices i
SET studio_id = COALESCE(
  (SELECT p.studio_id FROM public.projects p WHERE p.id = i.project_id),
  public._primary_studio_for(i.designer_id))
WHERE i.studio_id IS NULL;

-- ─── 4. Per-studio counter (keep invoice_counters for the studio-less fallback)
CREATE TABLE IF NOT EXISTS public.studio_invoice_counters (
  studio_id   uuid    PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_number integer NOT NULL DEFAULT 1
);
ALTER TABLE public.studio_invoice_counters ENABLE ROW LEVEL SECURITY;  -- zero policies: RPC-only

COMMENT ON TABLE public.studio_invoice_counters IS
  'Per-studio sequential invoice numbering. Row stores the last assigned number; touched only inside issue_invoice. RLS enabled with zero policies (RPC-only).';

-- ─── 5. Seed from existing per-studio max so new numbers never collide with history
INSERT INTO public.studio_invoice_counters (studio_id, next_number)
SELECT i.studio_id,
       MAX(NULLIF(regexp_replace(i.invoice_number, '\D', '', 'g'), '')::int)
FROM public.invoices i
WHERE i.studio_id IS NOT NULL AND i.invoice_number IS NOT NULL
GROUP BY i.studio_id
HAVING MAX(NULLIF(regexp_replace(i.invoice_number, '\D', '', 'g'), '')::int) IS NOT NULL
ON CONFLICT (studio_id) DO UPDATE
  SET next_number = GREATEST(EXCLUDED.next_number, studio_invoice_counters.next_number);

-- ─── 6. issue_invoice — grafted from 00178 verbatim, two deltas:
--        (a) studio-keyed counter when invoices.studio_id present;
--        (b) ownership guard widened to NOT is_studio_comember(...).
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id UUID,
  p_due_date DATE DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice    invoices%ROWTYPE;
  v_line_count INTEGER;
  v_subtotal   BIGINT;
  v_tax        INTEGER;
  v_number     INTEGER;
  v_due        DATE;
  v_studio_id  UUID;   -- DELTA (a)
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  -- DELTA (b): co-members of the invoice's designer may issue under the studio brand.
  IF NOT FOUND OR NOT public.is_studio_comember(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'issue_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_invoice: invoice % is %, expected draft', p_invoice_id, v_invoice.status;
  END IF;

  SELECT COUNT(*) INTO v_line_count
  FROM invoice_line_items WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has no line items', p_invoice_id;
  END IF;

  -- A linked milestone must not already be paid, nor billed on another live
  -- invoice. (The unique partial index on invoice_line_items.milestone_id
  -- already prevents double-linking; this guard catches the paid case and
  -- gives a readable error.)
  PERFORM 1
  FROM invoice_line_items li
  JOIN project_payment_milestones m ON m.id = li.milestone_id
  WHERE li.invoice_id = p_invoice_id
    AND (
      m.status = 'paid'
      OR EXISTS (
        SELECT 1
        FROM invoice_line_items li2
        JOIN invoices i2 ON i2.id = li2.invoice_id
        WHERE li2.milestone_id = li.milestone_id
          AND li2.invoice_id <> p_invoice_id
          AND i2.status IN ('draft','sent','partially_paid','paid')
      )
    );
  IF FOUND THEN
    RAISE EXCEPTION 'issue_invoice: a linked milestone is already paid or billed on another invoice';
  END IF;

  -- DELTA (a): sequential number — per-studio when the invoice carries a studio,
  -- else per-designer (the studio-less fallback). Row stores the last assigned.
  v_studio_id := v_invoice.studio_id;
  IF v_studio_id IS NOT NULL THEN
    INSERT INTO studio_invoice_counters (studio_id)
    VALUES (v_studio_id)
    ON CONFLICT (studio_id)
      DO UPDATE SET next_number = studio_invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  ELSE
    INSERT INTO invoice_counters (designer_id)
    VALUES (v_invoice.designer_id)
    ON CONFLICT (designer_id)
      DO UPDATE SET next_number = invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  END IF;

  -- Recompute money from lines (the client-side draft totals are advisory).
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_subtotal
  FROM invoice_line_items WHERE invoice_id = p_invoice_id;
  v_tax := ROUND(v_subtotal * v_invoice.tax_rate)::INTEGER;

  v_due := COALESCE(p_due_date, CURRENT_DATE + v_invoice.payment_terms_days);

  UPDATE invoices
  SET status         = 'sent',
      invoice_number = 'INV-' || LPAD(v_number::TEXT, 4, '0'),
      issue_date     = CURRENT_DATE,
      due_date       = v_due,
      subtotal_cents = v_subtotal::INTEGER,
      tax_cents      = v_tax,
      total_cents    = v_subtotal::INTEGER + v_tax,
      sent_at        = NOW(),
      updated_at     = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  -- Pending linked milestones become outstanding with the invoice due date.
  UPDATE project_payment_milestones m
  SET status   = 'outstanding',
      due_date = v_due,
      updated_at = NOW()
  FROM invoice_line_items li
  WHERE li.invoice_id = p_invoice_id
    AND li.milestone_id = m.id
    AND m.status = 'pending';

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(UUID, DATE) TO authenticated;

-- ─── 7. record_invoice_payment — grafted from 00178 verbatim, one delta:
--        ownership guard widened to NOT is_studio_comember(...). Earnings still
--        route to i.designer_id via apply_invoice_payment_effects (unchanged).
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount_cents INTEGER,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_received_at TIMESTAMPTZ DEFAULT NOW(),
  p_note TEXT DEFAULT NULL
)
RETURNS public.invoice_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_payment invoice_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  -- DELTA: co-members may record offline payments under the studio brand.
  IF NOT FOUND OR NOT public.is_studio_comember(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'record_invoice_payment: invoice % not found or access denied', p_invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('sent','partially_paid') THEN
    RAISE EXCEPTION 'record_invoice_payment: invoice % is %, expected sent or partially_paid',
      p_invoice_id, v_invoice.status;
  END IF;
  IF p_method = 'stripe' THEN
    RAISE EXCEPTION 'record_invoice_payment: stripe payments are recorded by the webhook, not manually';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'record_invoice_payment: amount must be positive';
  END IF;
  IF p_amount_cents > v_invoice.total_cents - v_invoice.amount_paid_cents THEN
    RAISE EXCEPTION 'record_invoice_payment: amount % exceeds remaining balance %',
      p_amount_cents, v_invoice.total_cents - v_invoice.amount_paid_cents;
  END IF;

  INSERT INTO invoice_payments (
    invoice_id, amount_cents, method, status,
    reference, note, recorded_by, received_at
  )
  VALUES (
    p_invoice_id, p_amount_cents, p_method, 'succeeded',
    p_reference, p_note, auth.uid(), COALESCE(p_received_at, NOW())
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

COMMENT ON COLUMN public.invoices.studio_id IS
  'Snapshot of the issuing studio (00318). Immutable even if the designer later changes studios; keys the per-studio invoice counter and the branding read path.';
