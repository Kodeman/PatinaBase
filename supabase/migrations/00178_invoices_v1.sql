-- ============================================================================
-- Migration 00178: Invoicing money core v1
--
-- Designer-issued invoices against a project: header (invoices), lines
-- (invoice_line_items — milestone / time / adhoc), payments
-- (invoice_payments — Stripe or manually recorded), per-designer sequential
-- numbering (invoice_counters), and a Stripe webhook idempotency ledger
-- (stripe_webhook_events).
--
-- State machine: draft → sent → partially_paid → paid, with void reachable
-- from draft/sent/partially_paid while nothing has been collected. All
-- transitions run through SECURITY DEFINER RPCs (issue_invoice,
-- record_invoice_payment, void_invoice); direct designer UPDATE is limited
-- to drafts by RLS. Payment side effects (amount_paid rollup, status flips,
-- designer_earnings rows, milestone paid-through) are centralized in
-- apply_invoice_payment_effects(), fired by an AFTER trigger on
-- invoice_payments so the Stripe webhook path (service role INSERT) and the
-- manual path (record_invoice_payment RPC) share one brain.
--
-- Deliberately excludes: client-portal pay surface, email send, A/R aging
-- page, unbilled-time pull-through (later waves). project_time_entries
-- (00177, parallel migration) gets its invoice_id FK here, order-tolerantly.
-- ============================================================================

-- ============================================================================
-- PART 1: invoices (header)
-- ============================================================================

CREATE TABLE public.invoices (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  designer_id                 UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id                   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  invoice_number              TEXT,
  status                      TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','sent','partially_paid','paid','void')),
  issue_date                  DATE,
  due_date                    DATE,
  payment_terms_days          INTEGER     NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  currency                    TEXT        NOT NULL DEFAULT 'USD',
  subtotal_cents              INTEGER     NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_rate                    NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_cents                   INTEGER     NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents                 INTEGER     NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  amount_paid_cents           INTEGER     NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  memo                        TEXT,
  internal_notes              TEXT,
  stripe_checkout_session_id  TEXT,
  sent_at                     TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  voided_at                   TIMESTAMPTZ,
  void_reason                 TEXT,
  reminder_count              INTEGER     NOT NULL DEFAULT 0,
  last_reminder_at            TIMESTAMPTZ,
  ar_flagged_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A paid invoice always carries its paid timestamp.
  CONSTRAINT chk_invoices_paid_at_when_paid
    CHECK (status <> 'paid' OR paid_at IS NOT NULL),
  -- Only drafts may be unnumbered; issue_invoice assigns the number.
  CONSTRAINT chk_invoices_number_when_issued
    CHECK (status = 'draft' OR invoice_number IS NOT NULL)
);

-- One number per designer (drafts are unnumbered, so partial).
CREATE UNIQUE INDEX uniq_invoices_designer_number
  ON public.invoices(designer_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX idx_invoices_project          ON public.invoices(project_id);
CREATE INDEX idx_invoices_designer_status  ON public.invoices(designer_id, status);
-- A/R surface: live receivables ordered by due date.
CREATE INDEX idx_invoices_due_date_live
  ON public.invoices(due_date)
  WHERE status IN ('sent','partially_paid');

-- ============================================================================
-- PART 2: invoice_line_items
-- ============================================================================

CREATE TABLE public.invoice_line_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL DEFAULT 'adhoc'
                      CHECK (kind IN ('milestone','time','adhoc')),
  milestone_id      UUID        REFERENCES public.project_payment_milestones(id) ON DELETE SET NULL,
  description       TEXT        NOT NULL,
  quantity          NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents INTEGER     NOT NULL DEFAULT 0,
  amount_cents      INTEGER     NOT NULL DEFAULT 0,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Milestone lines must point at a milestone (void_invoice clears the
  -- pointer AND flips kind handling is not needed — SET NULL on milestone
  -- delete is tolerated for historical invoices, hence kind check only at
  -- write time via this constraint being enforced on INSERT/UPDATE).
  CONSTRAINT chk_line_items_milestone_kind
    CHECK (kind <> 'milestone' OR milestone_id IS NOT NULL)
);

-- A milestone can be billed on at most one invoice line, ever, until released
-- (void_invoice clears milestone_id, releasing the slot).
CREATE UNIQUE INDEX uniq_invoice_line_items_milestone
  ON public.invoice_line_items(milestone_id)
  WHERE milestone_id IS NOT NULL;

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);

-- The milestone-kind CHECK above conflicts with ON DELETE SET NULL for rows
-- where kind='milestone'. Deleting a project_payment_milestones row that is
-- still referenced would violate the CHECK; in practice milestones are only
-- deleted with their project (CASCADE deletes the invoice first via
-- invoices.project_id CASCADE → line items CASCADE), so the SET NULL path is
-- effectively unreachable for live data. Documented for future maintainers.
COMMENT ON CONSTRAINT chk_line_items_milestone_kind ON public.invoice_line_items IS
  'milestone-kind lines must reference a milestone; void_invoice releases by clearing milestone_id (kind stays for history, the CHECK is bypassed because void also rewrites kind to adhoc — see void_invoice).';

-- ============================================================================
-- PART 3: invoice_payments
-- ============================================================================

CREATE TABLE public.invoice_payments (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  UUID        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_cents                INTEGER     NOT NULL CHECK (amount_cents > 0),
  method                      TEXT        NOT NULL
                                CHECK (method IN ('stripe','check','wire','ach_manual','cash','other')),
  status                      TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','succeeded','failed','refunded')),
  stripe_checkout_session_id  TEXT,
  stripe_payment_intent_id    TEXT,
  stripe_event_id             TEXT,
  reference                   TEXT,
  note                        TEXT,
  recorded_by                 UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invoice_payments_received_at_when_succeeded
    CHECK (status <> 'succeeded' OR received_at IS NOT NULL)
);

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);

-- Stripe idempotency: one payment row per PaymentIntent / Checkout Session.
CREATE UNIQUE INDEX uniq_invoice_payments_stripe_pi
  ON public.invoice_payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_invoice_payments_stripe_session
  ON public.invoice_payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ============================================================================
-- PART 4: invoice_counters + stripe_webhook_events
-- ============================================================================

CREATE TABLE public.invoice_counters (
  designer_id UUID    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1
);

-- Webhook idempotency ledger. id = Stripe event id (evt_…). Service-role only
-- (RLS enabled with zero policies).
CREATE TABLE public.stripe_webhook_events (
  id           TEXT        PRIMARY KEY,
  type         TEXT        NOT NULL,
  payload      JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PART 5: EXTEND EXISTING TABLES
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.designer_earnings
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_payment_id UUID REFERENCES public.invoice_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Idempotency anchor for apply_invoice_payment_effects: one earnings row per
-- succeeded payment.
CREATE UNIQUE INDEX uniq_designer_earnings_invoice_payment
  ON public.designer_earnings(invoice_payment_id)
  WHERE invoice_payment_id IS NOT NULL;

CREATE INDEX idx_designer_earnings_invoice
  ON public.designer_earnings(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- project_time_entries (00177) carries a nullable invoice_id with no FK; wire
-- it here. Order-tolerant: 00177 is being authored in parallel, so guard on
-- table existence — if 00177 lands after 00178 in a fresh reset, the FK is
-- added by re-running this DO block manually or by a follow-up migration.
DO $$
BEGIN
  -- NOTE: to_regclass() (not a ::regclass literal cast) so the expression
  -- stays evaluable when the table doesn't exist yet.
  IF to_regclass('public.project_time_entries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_time_entries_invoice'
         AND conrelid = to_regclass('public.project_time_entries')
     )
  THEN
    ALTER TABLE public.project_time_entries
      ADD CONSTRAINT fk_time_entries_invoice
        FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 6: updated_at TRIGGERS
-- ============================================================================

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_invoice_payments_updated_at
  BEFORE UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters      ENABLE ROW LEVEL SECURITY;  -- zero policies: RPC-only
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;  -- zero policies: service-role only

-- invoices
CREATE POLICY "Designers can view their invoices"
  ON public.invoices FOR SELECT
  USING (designer_id = auth.uid());

CREATE POLICY "Designers can create their invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (designer_id = auth.uid());

-- Direct UPDATE only while draft; all post-issue transitions go through RPCs.
CREATE POLICY "Designers can update their draft invoices"
  ON public.invoices FOR UPDATE
  USING (designer_id = auth.uid() AND status = 'draft')
  WITH CHECK (designer_id = auth.uid() AND status = 'draft');

CREATE POLICY "Designers can delete their invoices"
  ON public.invoices FOR DELETE
  USING (designer_id = auth.uid());

CREATE POLICY "Clients can view issued invoices on their projects"
  ON public.invoices FOR SELECT
  USING (
    status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = invoices.project_id AND p.client_id = auth.uid()
    )
  );

-- invoice_line_items
CREATE POLICY "Designers can view line items on their invoices"
  ON public.invoice_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id AND i.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers can add line items to their draft invoices"
  ON public.invoice_line_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.designer_id = auth.uid()
        AND i.status = 'draft'
    )
  );

CREATE POLICY "Designers can update line items on their draft invoices"
  ON public.invoice_line_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.designer_id = auth.uid()
        AND i.status = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.designer_id = auth.uid()
        AND i.status = 'draft'
    )
  );

CREATE POLICY "Designers can delete line items on their draft invoices"
  ON public.invoice_line_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.designer_id = auth.uid()
        AND i.status = 'draft'
    )
  );

CREATE POLICY "Clients can view line items on issued invoices"
  ON public.invoice_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.projects p ON p.id = i.project_id
      WHERE i.id = invoice_line_items.invoice_id
        AND i.status <> 'draft'
        AND p.client_id = auth.uid()
    )
  );

-- invoice_payments — read-only for both roles; writes happen via the
-- record_invoice_payment RPC (definer) or the Stripe webhook (service role).
CREATE POLICY "Designers can view payments on their invoices"
  ON public.invoice_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_payments.invoice_id AND i.designer_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view payments on issued invoices"
  ON public.invoice_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.projects p ON p.id = i.project_id
      WHERE i.id = invoice_payments.invoice_id
        AND i.status <> 'draft'
        AND p.client_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8: RPCs
-- ============================================================================

-- ─── issue_invoice ───────────────────────────────────────────────────────────
-- draft → sent: assigns the per-designer sequential number, recomputes totals
-- from lines, stamps issue/due dates, and flips linked pending milestones to
-- outstanding with the invoice due date.
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
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.designer_id IS DISTINCT FROM auth.uid() THEN
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

  -- Sequential per-designer number. Row stores the last assigned number.
  INSERT INTO invoice_counters (designer_id)
  VALUES (v_invoice.designer_id)
  ON CONFLICT (designer_id)
    DO UPDATE SET next_number = invoice_counters.next_number + 1
  RETURNING next_number INTO v_number;

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

-- ─── record_invoice_payment ──────────────────────────────────────────────────
-- Designer manually records an offline payment (check/wire/ach_manual/cash/
-- other — never stripe; Stripe rows are inserted by the webhook). The AFTER
-- trigger applies rollup/status/earnings effects.
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
  IF NOT FOUND OR v_invoice.designer_id IS DISTINCT FROM auth.uid() THEN
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

-- ─── void_invoice ────────────────────────────────────────────────────────────
-- Voidable while nothing has been collected. Releases linked milestones (so
-- they can be billed again) and releases any attached time entries.
CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id UUID,
  p_reason TEXT
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.designer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('draft','sent','partially_paid') THEN
    RAISE EXCEPTION 'void_invoice: invoice % is %, expected draft/sent/partially_paid',
      p_invoice_id, v_invoice.status;
  END IF;
  IF v_invoice.amount_paid_cents <> 0 THEN
    RAISE EXCEPTION 'void_invoice: invoice % has collected payments and cannot be voided', p_invoice_id;
  END IF;

  UPDATE invoices
  SET status      = 'void',
      voided_at   = NOW(),
      void_reason = p_reason,
      updated_at  = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  -- Release milestones: clear the pointer (frees the unique slot) and rewrite
  -- kind so the milestone-kind CHECK keeps holding. Keep the original
  -- milestone id in metadata for the audit trail.
  UPDATE invoice_line_items
  SET metadata     = metadata || jsonb_build_object('released_milestone_id', milestone_id::text),
      milestone_id = NULL,
      kind         = 'adhoc'
  WHERE invoice_id = p_invoice_id
    AND milestone_id IS NOT NULL;

  -- Linked milestones that were flipped outstanding by issue go back to
  -- pending (paid milestones are unreachable here — amount_paid is 0).
  UPDATE project_payment_milestones m
  SET status = 'pending',
      due_date = NULL,
      updated_at = NOW()
  FROM invoice_line_items li
  WHERE li.invoice_id = p_invoice_id
    AND (li.metadata->>'released_milestone_id')::uuid = m.id
    AND m.status = 'outstanding';

  -- Release time entries back to the unbilled pool (order-tolerant with 00177).
  IF to_regclass('public.project_time_entries') IS NOT NULL THEN
    EXECUTE 'UPDATE public.project_time_entries SET invoice_id = NULL WHERE invoice_id = $1'
    USING p_invoice_id;
  END IF;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) TO authenticated;

-- ─── apply_invoice_payment_effects (internal) ────────────────────────────────
-- Single source of truth for payment side effects. Idempotent: recomputes the
-- rollup from scratch and anchors earnings on the unique invoice_payment_id.
CREATE OR REPLACE FUNCTION public.apply_invoice_payment_effects(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice    invoices%ROWTYPE;
  v_paid       BIGINT;
  v_was_paid   BOOLEAN;
  v_new_status TEXT;
  v_paid_at    TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_was_paid := v_invoice.status = 'paid';

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id AND status = 'succeeded';

  -- Status derivation — never resurrects a void invoice.
  IF v_invoice.status = 'void' THEN
    v_new_status := 'void';
  ELSIF v_paid >= v_invoice.total_cents AND v_invoice.total_cents > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF v_invoice.status IN ('partially_paid','paid') THEN
    -- All payments refunded/failed → fall back to sent.
    v_new_status := 'sent';
  ELSE
    v_new_status := v_invoice.status;
  END IF;

  IF v_new_status = 'paid' THEN
    SELECT COALESCE(MAX(received_at), NOW()) INTO v_paid_at
    FROM invoice_payments
    WHERE invoice_id = p_invoice_id AND status = 'succeeded';
  ELSE
    v_paid_at := NULL;
  END IF;

  UPDATE invoices
  SET amount_paid_cents = v_paid::INTEGER,
      status            = v_new_status,
      paid_at           = v_paid_at,
      updated_at        = NOW()
  WHERE id = p_invoice_id;

  -- One designer_earnings row per succeeded payment (design fee revenue).
  -- Stripe money is 'confirmed' until the platform payout lands; manual
  -- methods are already in the designer's hands → 'paid'.
  INSERT INTO designer_earnings (
    designer_id, source_type, gross_amount, platform_fee, net_amount,
    description, status, paid_at, earned_at,
    invoice_id, invoice_payment_id, project_id
  )
  SELECT
    i.designer_id,
    'design_fee',
    p.amount_cents,
    0,
    p.amount_cents,
    'Invoice ' || COALESCE(i.invoice_number, '(draft)') || ' — ' || pr.name,
    CASE WHEN p.method = 'stripe' THEN 'confirmed' ELSE 'paid' END,
    CASE WHEN p.method = 'stripe' THEN NULL ELSE p.received_at END,
    COALESCE(p.received_at, NOW()),
    i.id,
    p.id,
    i.project_id
  FROM invoice_payments p
  JOIN invoices i  ON i.id = p.invoice_id
  JOIN projects pr ON pr.id = i.project_id
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'succeeded'
  ON CONFLICT (invoice_payment_id) WHERE invoice_payment_id IS NOT NULL
  DO NOTHING;

  -- Newly paid in full → linked milestones are paid through this invoice.
  IF v_new_status = 'paid' AND NOT v_was_paid THEN
    UPDATE project_payment_milestones m
    SET status     = 'paid',
        paid_at    = v_paid_at,
        updated_at = NOW()
    FROM invoice_line_items li
    WHERE li.invoice_id = p_invoice_id
      AND li.milestone_id = m.id
      AND m.status <> 'paid';
  END IF;
END;
$$;

-- Internal: no authenticated grant. service_role keeps EXECUTE for the Stripe
-- webhook path (its INSERT fires the trigger below as service_role).
-- NOTE: Supabase's ALTER DEFAULT PRIVILEGES auto-grants EXECUTE on new public
-- functions to anon/authenticated/service_role, so revoking PUBLIC alone is
-- not enough — revoke the roles explicitly.
REVOKE ALL ON FUNCTION public.apply_invoice_payment_effects(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_payment_effects(UUID) TO service_role;

-- ─── trigger: payments → effects ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_invoice_payments_apply_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.apply_invoice_payment_effects(NEW.invoice_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_invoice_payment_effects_on_change
  AFTER INSERT OR UPDATE OF status ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_payments_apply_effects();

-- ============================================================================
-- PART 9: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.invoices IS
  'Designer-issued invoice against a project. draft→sent→partially_paid→paid; void while uncollected. Numbered per designer on issue (invoice_counters).';
COMMENT ON TABLE public.invoice_line_items IS
  'Invoice lines: milestone (links project_payment_milestones, unique per live invoice), time (00177 pull-through, later wave), adhoc.';
COMMENT ON TABLE public.invoice_payments IS
  'One row per payment event. Manual rows via record_invoice_payment RPC; Stripe rows via webhook (service role). AFTER trigger centralizes rollup/status/earnings effects.';
COMMENT ON TABLE public.invoice_counters IS
  'Per-designer sequential invoice numbering. Row stores the last assigned number; touched only inside issue_invoice.';
COMMENT ON TABLE public.stripe_webhook_events IS
  'Stripe webhook idempotency ledger (id = evt_…). Service-role only; RLS enabled with zero policies.';
COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'Stripe Customer id for client-side invoice payment (created lazily by the checkout edge function, later wave).';
