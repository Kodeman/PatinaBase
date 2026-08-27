-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Client-visible invoices (W1b · b-notes.md §4)
--
-- Nothing seeded an invoice before this file, so a reset stack had zero rows in
-- `invoices` and four lines of the W1b acceptance walk had no subject: the due
-- date on the detail, the Patina-voice Pay failure, the settle banner's method
-- branch, and the paid-invoice payments line. `INV-2026-0142` — the invoice the
-- W0 re-walk drove end to end — was hand-made data on a pre-reset stack.
--
-- Two invoices on the Aspen Loft Refresh project (designer@patina.dev →
-- client@patina.dev):
--   - INV-2026-0142  `sent`, due in 5 days, two line items, NO payment rows
--   - INV-2026-0141  `paid`, paid in full, NO payment rows — the subject for
--                    "Paid in full. Your designer recorded this payment outside
--                    Patina."
--
-- Dates are relative (the repo's seed convention — decisions.sql does the same)
-- so the `sent` invoice is always a live receivable. On the wave's own date
-- (2026-08-27) the due line reads "Due Sep 1".
--
-- Money is integer cents (00178_invoices_v1.sql). `studio_id` is left NULL and
-- derived by the BEFORE INSERT trigger `set_invoice_studio_id` (00318:63).
--
-- Idempotent: safe to re-run on `supabase db reset`.
-- Prerequisite: decisions.sql must have run first (it creates the project).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer  UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client    UUID := 'a0000000-0000-0000-0000-000000000005';
  v_project_id  UUID := 'b0000000-0000-0000-0000-0000000000d1';
  v_inv_sent    UUID := 'b0000000-0000-0000-0000-00000000e142';
  v_inv_paid    UUID := 'b0000000-0000-0000-0000-00000000e141';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE NOTICE 'invoices.sql: Aspen Loft project missing - run decisions.sql first';
    RETURN;
  END IF;

  -- Line items cascade with the invoice.
  DELETE FROM public.invoices WHERE id IN (v_inv_sent, v_inv_paid);

  -- ─── The open receivable the walk pays ────────────────────────────────────
  INSERT INTO public.invoices (
    id, project_id, designer_id, client_id, invoice_number, status,
    issue_date, due_date, payment_terms_days, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents,
    memo, sent_at
  ) VALUES (
    v_inv_sent, v_project_id, uid_designer, uid_client, 'INV-2026-0142', 'sent',
    CURRENT_DATE - 10, CURRENT_DATE + 5, 15, 'USD',
    425000, 0, 0, 425000, 0,
    'Phase 2 design fee and procurement management.',
    NOW() - INTERVAL '10 days'
  );

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order
  ) VALUES
    (v_inv_sent, 'adhoc', 'Design fee — Phase 2 (concept through specification)', 1, 300000, 300000, 0),
    (v_inv_sent, 'adhoc', 'Procurement management — dining and living',            1, 125000, 125000, 1);

  -- ─── The settled one, with no payment row of its own ──────────────────────
  -- The designer recorded this outside Patina, so `invoice_payments` is empty
  -- and the client screen must say so rather than print a method it does not
  -- have.
  INSERT INTO public.invoices (
    id, project_id, designer_id, client_id, invoice_number, status,
    issue_date, due_date, payment_terms_days, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents,
    memo, sent_at, paid_at
  ) VALUES (
    v_inv_paid, v_project_id, uid_designer, uid_client, 'INV-2026-0141', 'paid',
    CURRENT_DATE - 45, CURRENT_DATE - 30, 15, 'USD',
    250000, 0, 0, 250000, 250000,
    'Initial design retainer.',
    NOW() - INTERVAL '45 days', NOW() - INTERVAL '28 days'
  );

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order
  ) VALUES
    (v_inv_paid, 'adhoc', 'Design retainer — Aspen Loft Refresh', 1, 250000, 250000, 0);

  RAISE NOTICE 'invoices.sql: seeded INV-2026-0142 (sent) and INV-2026-0141 (paid)';
END $$;
