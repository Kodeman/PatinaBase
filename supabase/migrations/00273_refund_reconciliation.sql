-- ═══════════════════════════════════════════════════════════════════════════
-- 00273 — Refund reconciliation v1 (partially lifts the "refund state machine
--          is v2" deferral)
--
-- The consolidated Stripe rail now settles three payable types (invoice 00178,
-- po_payment 00271, direct_order 00272). `charge.refunded` has been ledger-only
-- since 00178 — the webhook's own comment reads "refund state machine is v2".
-- Real money is about to flow, and a dashboard-initiated refund must not leave
-- an invoice reading "paid", designer earnings credited, or a direct order
-- looking fulfilled-payable. This migration lifts JUST the FULL-refund case:
-- FULL refunds flip payable state and reverse accounting; PARTIAL refunds stay
-- v2 (the webhook logs + notifies but changes no row).
--
-- Audit-first findings (read before trusting this migration):
--   · apply_invoice_payment_effects (00178) is the SINGLE source of truth for
--     invoice rollups and is the LATEST lineage — no migration after 00178
--     CREATE-OR-REPLACEs it (grep confirms 00178 is the only definer). It
--     already recomputes amount_paid_cents over `succeeded` payments only, so a
--     row leaving `succeeded` (→ refunded) is ALREADY subtracted, the status
--     re-derivation already falls partially_paid/paid → `sent` when paid drops
--     to 0, and paid_at is already cleared when no longer paid. What it did NOT
--     do: reverse the designer_earnings row for the refunded payment, and
--     un-pay the milestones a paid invoice flipped through. This migration adds
--     exactly those two reverse effects — leaving the (correct) forward
--     derivation logic byte-for-byte intact.
--   · designer_earnings (00014) is NOT a plain ledger — it carries settlement/
--     payout state: `status` ('pending'|'confirmed'|'paid'|'cancelled'),
--     `payout_id` (payout-batch reference), and `paid_at`. A hard DELETE of the
--     refunded payment's earnings row could therefore silently drop a row that
--     was already netted into a designer payout — corrupting payout history and
--     leaving the books unbalanced. So the reversal is a NEGATIVE CONTRA ROW,
--     not a delete: it mirrors the original's source_type/status/invoice/
--     project and negates gross/platform/net, so ANY aggregate SUM(net_amount)
--     grouped by designer (and by status bucket) nets the refund out while both
--     the original credit and its reversal remain visible for audit. It is
--     keyed on a NEW column `reverses_invoice_payment_id` with a partial-unique
--     index (NOT on invoice_payment_id — the original row already occupies that
--     unique slot from 00178's uniq_designer_earnings_invoice_payment), so a
--     webhook replay OR a distinct-event refund replay OR a re-fire of the
--     trigger can never double-reverse (ON CONFLICT DO NOTHING).
--   · project_payment_milestones (00066) status is a bare CHECK
--     ('pending'|'outstanding'|'paid') with NO state-machine trigger forbidding
--     a back-transition (grep: zero triggers defined ON that table). The 00178
--     forward flip sets linked milestone lines to 'paid' only on the invoice's
--     transition INTO 'paid'. The mirror is therefore safe and symmetric: when
--     a refund drops the invoice BELOW paid, the milestone lines this invoice
--     paid through return to 'outstanding' (their issue-time state — the invoice
--     is still live and still billing them) with paid_at cleared. Idempotent via
--     the `m.status = 'paid'` guard.
--
-- Enum/CHECK surface for the webhook writers (this migration only WIDENS the
-- domains; the webhook, in a separate runtime transaction, writes the values):
--   · po_payment_state       += 'refunded'   (full po refund; paid_date kept)
--   · direct_orders.status   += 'refunded'   (full direct-order refund)
--   · procurement_notification_kind += 'payment_refunded'
--
-- ADD-VALUE PITFALL: `ALTER TYPE … ADD VALUE` may not be USED in the same
-- transaction that adds it. Both ADD VALUEs sit at the TOP of this file and are
-- NOT referenced anywhere below (not in the CHECK re-add — that uses the bare
-- TEXT literal 'refunded', not the po_payment_state enum — and not in the
-- function body, which never touches either enum). The webhook is the only
-- writer of the new labels.
--
-- Re-run safe (local stacks carry colliding migration numbers; apply directly):
-- ADD VALUE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS before ADD, CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PART 0: widen enum domains (top-of-file; new values NOT used below) ─────

ALTER TYPE public.po_payment_state ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE public.procurement_notification_kind ADD VALUE IF NOT EXISTS 'payment_refunded';

COMMENT ON TYPE public.procurement_notification_kind IS
  'In-app notification kinds for the procurement workspace. '
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to ''due'' from a non-due state '
  '(00184 lifecycle triggers, manual flips, or the daily po-payments-due-daily pg_cron job from 00189). '
  'delivery_this_week: produced by the delivery-this-week-weekly pg_cron job (00189). '
  'damage_claim_drafted: fired on INSERT into damage_claims with state = ''drafted''. '
  'payment_received / payment_failed: fired by the stripe-webhook po_payment branch (00271) when an '
  '"Order via Patina" purchase-order payment settles or its ACH transfer fails. '
  'payment_refunded: fired by the stripe-webhook charge.refunded branch (00273) when a paid po_payment '
  'is refunded (full → state flips to ''refunded''; partial → state kept, notification is informational).';

-- ─── PART 1: direct_orders.status += 'refunded' (idempotent drop + re-add) ───
--
-- Full refund of a client "buy now" order flips status pending?→ 'refunded'
-- (webhook, guarded on 'paid'). Plain TEXT CHECK, so the literal below is NOT
-- the po_payment_state enum value from PART 0 — no ADD-VALUE-use conflict.

ALTER TABLE public.direct_orders DROP CONSTRAINT IF EXISTS direct_orders_status_check;
ALTER TABLE public.direct_orders
  ADD CONSTRAINT direct_orders_status_check
  CHECK (status IN ('pending_payment', 'paid', 'canceled', 'refunded'));

-- ─── PART 2: designer_earnings reversal key ─────────────────────────────────
--
-- The contra-row's linkage to the refunded payment. NOT invoice_payment_id:
-- that column's partial-unique index (00178) is already held by the original
-- credit row, and its ON CONFLICT anchors the forward earnings insert. A
-- dedicated key + its own partial-unique index gives the reversal an
-- independent idempotency latch (one reversal per refunded payment, ever).

ALTER TABLE public.designer_earnings
  ADD COLUMN IF NOT EXISTS reverses_invoice_payment_id UUID
    REFERENCES public.invoice_payments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.designer_earnings.reverses_invoice_payment_id IS
  'Set only on a refund CONTRA row (00273): the invoice_payments.id whose '
  'earnings this negative row reverses. NULL on all forward credit rows. '
  'Partial-unique (uniq_designer_earnings_reversal) so a payment is reversed at '
  'most once — replay-safe. The original credit keeps its invoice_payment_id; '
  'the contra row leaves invoice_payment_id NULL to avoid colliding with '
  'uniq_designer_earnings_invoice_payment.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_designer_earnings_reversal
  ON public.designer_earnings(reverses_invoice_payment_id)
  WHERE reverses_invoice_payment_id IS NOT NULL;

-- ─── PART 3: apply_invoice_payment_effects — add the two reverse effects ─────
--
-- CREATE OR REPLACE of the 00178 body. The forward derivation (amount_paid
-- recompute over succeeded, status derivation incl. never-resurrect-void,
-- paid_at, forward earnings insert, forward milestone flip) is preserved
-- VERBATIM. Added: (1) earnings contra rows for refunded payments; (2) the
-- milestone un-pay mirror when the invoice drops below fully-paid.

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

  -- 00273 REVERSE EFFECT 1 — earnings contra rows for refunded payments.
  -- designer_earnings carries settlement/payout state (status/payout_id/
  -- paid_at), so we never DELETE the credit — we post a negative mirror that
  -- nets it out in any aggregate while both rows stay auditable. The reversal
  -- mirrors the original's source_type/status/invoice/project (so it nets
  -- inside the SAME status bucket the credit landed in) and negates the money;
  -- paid_at is NULL (a clawback recognized now, not yet payout-settled) and
  -- invoice_payment_id is NULL (the credit holds that unique slot). Keyed on
  -- reverses_invoice_payment_id → at most one reversal per payment, ever.
  INSERT INTO designer_earnings (
    designer_id, source_type, gross_amount, platform_fee, net_amount,
    description, status, paid_at, earned_at,
    invoice_id, invoice_payment_id, project_id, reverses_invoice_payment_id
  )
  SELECT
    orig.designer_id,
    orig.source_type,
    -orig.gross_amount,
    -orig.platform_fee,
    -orig.net_amount,
    'Refund reversal — ' || COALESCE(orig.description, 'invoice payment'),
    orig.status,
    NULL,
    NOW(),
    orig.invoice_id,
    NULL,
    orig.project_id,
    p.id
  FROM invoice_payments p
  JOIN designer_earnings orig ON orig.invoice_payment_id = p.id
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'refunded'
  ON CONFLICT (reverses_invoice_payment_id) WHERE reverses_invoice_payment_id IS NOT NULL
  DO NOTHING;

  IF v_new_status = 'paid' AND NOT v_was_paid THEN
    -- Newly paid in full → linked milestones are paid through this invoice.
    UPDATE project_payment_milestones m
    SET status     = 'paid',
        paid_at    = v_paid_at,
        updated_at = NOW()
    FROM invoice_line_items li
    WHERE li.invoice_id = p_invoice_id
      AND li.milestone_id = m.id
      AND m.status <> 'paid';
  ELSIF v_was_paid AND v_new_status <> 'paid' THEN
    -- 00273 REVERSE EFFECT 2 — a refund dropped the invoice below fully-paid.
    -- Un-pay the milestone lines this invoice paid through: they return to
    -- 'outstanding' (issue-time state; the invoice is still live and billing
    -- them) with paid_at cleared. Symmetric with the forward flip; idempotent
    -- via the m.status = 'paid' guard (a replay finds them already outstanding).
    UPDATE project_payment_milestones m
    SET status     = 'outstanding',
        paid_at    = NULL,
        updated_at = NOW()
    FROM invoice_line_items li
    WHERE li.invoice_id = p_invoice_id
      AND li.milestone_id = m.id
      AND m.status = 'paid';
  END IF;
END;
$$;

-- Preserve 00178's grants (CREATE OR REPLACE keeps them, but restate for the
-- direct-apply path where the function may be created fresh).
REVOKE ALL ON FUNCTION public.apply_invoice_payment_effects(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_payment_effects(UUID) TO service_role;

COMMENT ON FUNCTION public.apply_invoice_payment_effects(UUID) IS
  'Single source of truth for invoice payment side effects (00178 + 00273 '
  'refund reversal). Recomputes amount_paid over succeeded payments, derives '
  'status (never resurrects void), stamps/clears paid_at, upserts one earnings '
  'credit per succeeded payment, posts a negative earnings contra row per '
  'refunded payment (keyed on reverses_invoice_payment_id, replay-safe), and '
  'flips linked milestones paid?→outstanding as the invoice crosses the '
  'fully-paid line in either direction. Fired by the AFTER INSERT OR UPDATE OF '
  'status trigger on invoice_payments.';
