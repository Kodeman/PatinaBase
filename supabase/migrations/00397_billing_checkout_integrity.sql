-- ══════════════════════════════════════════════════════════════════════════
-- 00397 — Invoice milestone + Checkout integrity
--
-- Money-path invariants established here:
--   * a milestone draft and its exact milestone line are one transaction;
--   * void releases both line and header milestone latches for a clean redraft;
--   * every invoice Checkout has one database-claimed active attempt and one
--     pending payment row before Stripe is called;
--   * the attempt owns a stable Stripe idempotency key and payer/customer;
--   * session persistence is an atomic RPC, never a best-effort pair of writes;
--   * a Stripe payment that would exceed the live invoice balance is recorded
--     as requires_refund and lands an idempotent human reconciliation task;
--   * generate / issue / send-capability / void use one studio co-member rule.
--
-- Service-only checkout RPCs intentionally accept explicit payer ids because
-- Edge Functions call them with the service role. EXECUTE is revoked from all
-- browser roles; caller authorization is independently enforced in the Edge
-- Function and payer eligibility is rechecked here against the locked invoice.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Checkout attempt ledger + explicit reconciliation state ──────────

ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_status_check;
ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS chk_invoice_payments_status;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT chk_invoice_payments_status
  CHECK (status IN ('pending','succeeded','failed','refunded','requires_refund'));

CREATE TABLE public.invoice_checkout_attempts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payer_id                    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  stripe_customer_id          text NOT NULL,
  amount_cents                integer NOT NULL CHECK (amount_cents > 0),
  currency                    text NOT NULL CHECK (currency = lower(currency) AND length(currency) = 3),
  state                       text NOT NULL DEFAULT 'claimed'
                                CHECK (state IN (
                                  'claimed','session_created','processing',
                                  'succeeded','failed','expired','superseded',
                                  'requires_refund','refunded'
                                )),
  stripe_idempotency_key      text NOT NULL UNIQUE,
  stripe_checkout_session_id  text UNIQUE,
  stripe_payment_intent_id    text UNIQUE,
  failure_reason              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  finalized_at                timestamptz,
  CONSTRAINT chk_invoice_checkout_session_state
    CHECK (
      state NOT IN ('session_created','processing','succeeded','requires_refund','refunded')
      OR stripe_checkout_session_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX uniq_invoice_checkout_active_attempt
  ON public.invoice_checkout_attempts(invoice_id)
  WHERE state IN ('claimed','session_created','processing');

CREATE INDEX idx_invoice_checkout_attempts_invoice_created
  ON public.invoice_checkout_attempts(invoice_id, created_at DESC);

ALTER TABLE public.invoice_payments
  ADD COLUMN checkout_attempt_id uuid
    REFERENCES public.invoice_checkout_attempts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uniq_invoice_payments_checkout_attempt
  ON public.invoice_payments(checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

CREATE TRIGGER set_invoice_checkout_attempts_updated_at
  BEFORE UPDATE ON public.invoice_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.invoice_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_checkout_attempts TO service_role;

COMMENT ON TABLE public.invoice_checkout_attempts IS
  'Service-only, one-row-per-attempt invoice Checkout ledger. A partial unique index permits one active payer/customer-bound attempt per invoice; stripe_idempotency_key is stable across retries.';
COMMENT ON COLUMN public.invoice_payments.checkout_attempt_id IS
  'Exact database-claimed Checkout attempt that created this Stripe payment row. NULL only for legacy/manual payments.';

-- Backfill only the exact legacy pending row named by the invoice pointer.
-- Older unrelated pending rows stay historical and are never guessed/reused.
INSERT INTO public.invoice_checkout_attempts (
  id, invoice_id, payer_id, stripe_customer_id, amount_cents, currency, state,
  stripe_idempotency_key, stripe_checkout_session_id, stripe_payment_intent_id,
  created_at, updated_at, finalized_at
)
SELECT
  gen_random_uuid(), p.invoice_id, p.recorded_by, pr.stripe_customer_id,
  p.amount_cents, lower(coalesce(i.currency, 'USD')),
  CASE WHEN p.stripe_payment_intent_id IS NULL THEN 'session_created' ELSE 'processing' END,
  'invoice-checkout:legacy:' || p.id::text,
  p.stripe_checkout_session_id, p.stripe_payment_intent_id,
  p.created_at, p.updated_at, p.created_at
FROM public.invoice_payments p
JOIN public.invoices i
  ON i.id = p.invoice_id
 AND i.stripe_checkout_session_id = p.stripe_checkout_session_id
JOIN public.profiles pr
  ON pr.id = p.recorded_by
WHERE p.method = 'stripe'
  AND p.status = 'pending'
  AND p.stripe_checkout_session_id IS NOT NULL
  AND p.recorded_by IS NOT NULL
  AND pr.stripe_customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_checkout_attempts a
    WHERE a.invoice_id = p.invoice_id
      AND a.state IN ('claimed','session_created','processing')
  )
ON CONFLICT DO NOTHING;

UPDATE public.invoice_payments p
SET checkout_attempt_id = a.id
FROM public.invoice_checkout_attempts a
WHERE p.checkout_attempt_id IS NULL
  AND a.stripe_checkout_session_id = p.stripe_checkout_session_id
  AND a.invoice_id = p.invoice_id;

-- ── 2. Milestone draft repair + atomic lifecycle ─────────────────────

-- Repair the precise bad historical shape: a milestone points at a DRAFT
-- invoice whose header has zero lines. Existing authored lines are not touched.
INSERT INTO public.invoice_line_items (
  invoice_id, kind, milestone_id, description, quantity,
  unit_amount_cents, amount_cents, metadata, sort_order
)
SELECT
  i.id, 'milestone', m.id, m.label, 1,
  m.amount_cents, m.amount_cents,
  jsonb_build_object('source', 'milestone_draft_repair'), 0
FROM public.project_payment_milestones m
JOIN public.invoices i ON i.id = m.invoice_id AND i.status = 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoice_line_items li WHERE li.invoice_id = i.id
);

-- Draft creation never makes a milestone collectible. Correct historical
-- header-only drafts that the old function prematurely marked outstanding.
UPDATE public.project_payment_milestones m
SET status = 'pending', due_date = NULL, paid_at = NULL, updated_at = now()
FROM public.invoices i
WHERE i.id = m.invoice_id
  AND i.status = 'draft'
  AND m.status = 'outstanding';

-- Legacy void invoices kept the milestone header latch. Release it once.
UPDATE public.project_payment_milestones m
SET invoice_id = NULL, status = 'pending', due_date = NULL, paid_at = NULL,
    updated_at = now()
FROM public.invoices i
WHERE i.id = m.invoice_id
  AND i.status = 'void';

CREATE OR REPLACE FUNCTION public.draft_invoice_from_milestone(p_milestone_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m          project_payment_milestones%ROWTYPE;
  v_p          projects%ROWTYPE;
  v_inv        uuid;
  v_inv_status text;
  v_line_count integer;
BEGIN
  SELECT * INTO v_m
  FROM project_payment_milestones
  WHERE id = p_milestone_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_invoice_from_milestone: milestone % not found', p_milestone_id;
  END IF;

  -- Idempotency and safe repair share the same milestone lock. A dangling or
  -- void header latch is released; a header-only draft receives its exact line.
  IF v_m.invoice_id IS NOT NULL THEN
    SELECT status INTO v_inv_status FROM invoices WHERE id = v_m.invoice_id;
    IF NOT FOUND OR v_inv_status = 'void' THEN
      UPDATE project_payment_milestones
      SET invoice_id = NULL, status = 'pending', due_date = NULL, paid_at = NULL,
          updated_at = now()
      WHERE id = p_milestone_id;
      v_m.invoice_id := NULL;
    ELSIF v_inv_status = 'draft' THEN
      SELECT count(*) INTO v_line_count
      FROM invoice_line_items WHERE invoice_id = v_m.invoice_id;

      IF v_line_count = 0 THEN
        INSERT INTO invoice_line_items (
          invoice_id, kind, milestone_id, description, quantity,
          unit_amount_cents, amount_cents, metadata, sort_order
        ) VALUES (
          v_m.invoice_id, 'milestone', v_m.id, v_m.label, 1,
          v_m.amount_cents, v_m.amount_cents,
          jsonb_build_object('source', 'milestone_draft_repair'), 0
        );
      ELSIF NOT EXISTS (
        SELECT 1 FROM invoice_line_items
        WHERE invoice_id = v_m.invoice_id AND milestone_id = v_m.id
      ) THEN
        RAISE EXCEPTION
          'draft_invoice_from_milestone: draft invoice % has authored lines but no line for milestone %; refusing unsafe repair',
          v_m.invoice_id, v_m.id;
      END IF;

      UPDATE project_payment_milestones
      SET status = 'pending', due_date = NULL, paid_at = NULL, updated_at = now()
      WHERE id = p_milestone_id AND status = 'outstanding';
      RETURN v_m.invoice_id;
    ELSE
      RETURN v_m.invoice_id;
    END IF;
  END IF;

  SELECT * INTO v_p FROM projects WHERE id = v_m.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_invoice_from_milestone: project % not found', v_m.project_id;
  END IF;

  INSERT INTO invoices (
    project_id, designer_id, client_id, status,
    subtotal_cents, tax_cents, total_cents, memo
  ) VALUES (
    v_m.project_id, v_p.designer_id, v_p.client_id, 'draft',
    v_m.amount_cents, 0, v_m.amount_cents,
    v_m.label || ' — payment milestone'
  ) RETURNING id INTO v_inv;

  -- This insert is part of the same statement transaction as header + latch.
  -- Any uniqueness/check/trigger failure rolls all three writes back.
  INSERT INTO invoice_line_items (
    invoice_id, kind, milestone_id, description, quantity,
    unit_amount_cents, amount_cents, metadata, sort_order
  ) VALUES (
    v_inv, 'milestone', v_m.id, v_m.label, 1,
    v_m.amount_cents, v_m.amount_cents,
    jsonb_build_object('source', 'milestone_autodraft'), 0
  );

  UPDATE project_payment_milestones
  SET invoice_id = v_inv, status = 'pending', due_date = NULL, paid_at = NULL,
      updated_at = now()
  WHERE id = p_milestone_id;

  -- Courtesy notification only. The nested exception deliberately excludes
  -- every money write above.
  BEGIN
    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_p.designer_id, 'invoice_draft_created', 'in_app', 'delivered',
      'invoice-draft-created',
      jsonb_build_object(
        'invoice_id', v_inv, 'milestone_id', p_milestone_id,
        'project_id', v_m.project_id, 'amount_cents', v_m.amount_cents,
        'subject', 'Draft invoice ready — ' || v_m.label,
        'title', 'Draft invoice ready — ' || v_m.label,
        'message', coalesce(v_p.name, 'Your project') || ': a draft invoice for '
          || v_m.label || ' is ready to review and send.',
        'deep_link', '/desk?book=accounts&page=ledger&invoiceId=' || v_inv::text,
        'url', '/desk?book=accounts&page=ledger&invoiceId=' || v_inv::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'draft_invoice_from_milestone: notification insert failed for milestone % (invoice %): %',
      p_milestone_id, v_inv, sqlerrm;
  END;

  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.draft_invoice_from_milestone(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.draft_invoice_from_milestone(uuid) TO service_role;

COMMENT ON FUNCTION public.draft_invoice_from_milestone(uuid) IS
  'Atomically creates one draft invoice plus one exact milestone line and latches the milestone. Repairs the historical header-only draft shape under the same milestone lock; notification remains best effort.';

-- Financial acts are narrower than shared-workspace visibility. The general
-- is_studio_comember helper intentionally treats any shared organization as a
-- collaboration boundary; issuing, collecting, sending, and voiding a client
-- receivable require the exact designer or an active non-guest peer in the
-- same active design_studio.
CREATE OR REPLACE FUNCTION public._can_manage_invoice_owner(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._can_author_proposal(p_owner);
$$;

REVOKE ALL ON FUNCTION public._can_manage_invoice_owner(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._can_manage_invoice_owner(uuid) IS
  'Private invoice authority: exact designer or active non-guest peer in the same active design_studio; contractor/manufacturer co-membership never grants money authority.';

CREATE OR REPLACE FUNCTION public.generate_milestone_invoice(p_milestone_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_designer uuid;
BEGIN
  SELECT p.designer_id INTO v_designer
  FROM project_payment_milestones m
  JOIN projects p ON p.id = m.project_id
  WHERE m.id = p_milestone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generate_milestone_invoice: milestone % not found', p_milestone_id;
  END IF;
  IF NOT public._can_manage_invoice_owner(v_designer) THEN
    RAISE EXCEPTION 'generate_milestone_invoice: milestone % not found or access denied', p_milestone_id;
  END IF;
  RETURN public.draft_invoice_from_milestone(p_milestone_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_milestone_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_milestone_invoice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND public._can_manage_invoice_owner(i.designer_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_manage_invoice(uuid) IS
  'Authenticated capability check shared by invoice-send and tests. True only for the invoice owner or an active non-guest peer in the same active design_studio.';

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text
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
  IF NOT FOUND OR NOT public.is_studio_comember(v_invoice.designer_id) THEN
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
  SET status = 'void', voided_at = now(), void_reason = p_reason,
      stripe_checkout_session_id = NULL, updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  -- Reset the milestone while both the header latch and live line pointer are
  -- still available. Covers old header-only drafts as well as current lines.
  UPDATE project_payment_milestones m
  SET invoice_id = NULL, status = 'pending', due_date = NULL, paid_at = NULL,
      updated_at = now()
  WHERE m.invoice_id = p_invoice_id
     OR EXISTS (
       SELECT 1 FROM invoice_line_items li
       WHERE li.invoice_id = p_invoice_id AND li.milestone_id = m.id
     );

  UPDATE invoice_line_items
  SET metadata = metadata || jsonb_build_object('released_milestone_id', milestone_id::text),
      milestone_id = NULL,
      kind = 'adhoc'
  WHERE invoice_id = p_invoice_id
    AND milestone_id IS NOT NULL;

  UPDATE invoice_line_items
  SET metadata = metadata || jsonb_build_object('released_ffe_item_id', ffe_item_id::text),
      ffe_item_id = NULL,
      kind = 'adhoc'
  WHERE invoice_id = p_invoice_id
    AND ffe_item_id IS NOT NULL;

  IF to_regclass('public.project_time_entries') IS NOT NULL THEN
    EXECUTE 'UPDATE public.project_time_entries SET invoice_id = NULL WHERE invoice_id = $1'
    USING p_invoice_id;
  END IF;

  -- A hosted session cannot be expired from SQL. Close the local attempt and
  -- row now; if Stripe reports a late charge, settle_invoice_checkout_payment
  -- converts it to requires_refund because the invoice is void.
  UPDATE invoice_payments
  SET status = 'failed',
      note = concat_ws(' ', note, 'Invoice voided before Checkout settled.')
  WHERE invoice_id = p_invoice_id
    AND status = 'pending'
    AND method = 'stripe';

  UPDATE invoice_checkout_attempts
  SET state = 'failed', failure_reason = 'invoice_voided', finalized_at = now()
  WHERE invoice_id = p_invoice_id
    AND state IN ('claimed','session_created','processing');

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;

-- Preserve the mature invoice bodies while placing one exact design-studio
-- gate in front of every browser-callable money transition. The renamed
-- implementations retain their internal locks and invariants but are private;
-- only these checked wrappers remain callable by authenticated users.
ALTER FUNCTION public.issue_invoice(uuid, date)
  RENAME TO _issue_invoice_authorized_legacy_00397;
REVOKE ALL ON FUNCTION public._issue_invoice_authorized_legacy_00397(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_manage_invoice_owner(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'issue_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._issue_invoice_authorized_legacy_00397(p_invoice_id, p_due_date);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, date) TO authenticated;

ALTER FUNCTION public.record_invoice_payment(
  uuid, integer, text, text, timestamptz, text
) RENAME TO _record_invoice_payment_authorized_legacy_00397;
REVOKE ALL ON FUNCTION public._record_invoice_payment_authorized_legacy_00397(
  uuid, integer, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_method text,
  p_reference text DEFAULT NULL,
  p_received_at timestamptz DEFAULT now(),
  p_note text DEFAULT NULL
)
RETURNS public.invoice_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_manage_invoice_owner(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'record_invoice_payment: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._record_invoice_payment_authorized_legacy_00397(
    p_invoice_id,
    p_amount_cents,
    p_method,
    p_reference,
    p_received_at,
    p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, integer, text, text, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(
  uuid, integer, text, text, timestamptz, text
) TO authenticated;

ALTER FUNCTION public.void_invoice(uuid, text)
  RENAME TO _void_invoice_authorized_legacy_00397;
REVOKE ALL ON FUNCTION public._void_invoice_authorized_legacy_00397(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_manage_invoice_owner(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._void_invoice_authorized_legacy_00397(p_invoice_id, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;

-- ── 3. Atomic Checkout claim/finalize/fail RPCs ──────────────────────

CREATE OR REPLACE FUNCTION public.claim_invoice_checkout_attempt(
  p_invoice_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_allow_designer_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice       invoices%ROWTYPE;
  v_project_client uuid;
  v_expected_payer uuid;
  v_profile_customer text;
  v_amount        integer;
  v_attempt       invoice_checkout_attempts%ROWTYPE;
  v_payment       invoice_payments%ROWTYPE;
  v_attempt_id    uuid;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_checkout_not_found';
  END IF;

  SELECT client_id INTO v_project_client
  FROM projects WHERE id = v_invoice.project_id;

  v_expected_payer := coalesce(v_invoice.client_id, v_project_client);
  IF p_payer_id IS DISTINCT FROM v_expected_payer
     AND NOT (p_allow_designer_test AND p_payer_id = v_invoice.designer_id) THEN
    RAISE EXCEPTION 'invoice_checkout_payer_not_allowed';
  END IF;

  SELECT stripe_customer_id INTO v_profile_customer
  FROM profiles WHERE id = p_payer_id;
  IF NOT FOUND OR v_profile_customer IS NULL
     OR v_profile_customer IS DISTINCT FROM p_stripe_customer_id THEN
    RAISE EXCEPTION 'invoice_checkout_customer_mismatch';
  END IF;

  IF v_invoice.status NOT IN ('sent','partially_paid') THEN
    RAISE EXCEPTION 'invoice_checkout_not_payable:%', v_invoice.status;
  END IF;
  v_amount := v_invoice.total_cents - v_invoice.amount_paid_cents;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invoice_checkout_nothing_due';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id AND state = 'requires_refund'
  ) THEN
    RAISE EXCEPTION 'invoice_checkout_reconciliation_required';
  END IF;

  -- Normalize a terminal payment whose attempt state was not yet synchronized
  -- (e.g. process interruption between legacy writes).
  UPDATE invoice_checkout_attempts a
  SET state = CASE p.status
                WHEN 'succeeded' THEN 'succeeded'
                WHEN 'failed' THEN 'failed'
                WHEN 'refunded' THEN 'refunded'
                WHEN 'requires_refund' THEN 'requires_refund'
                ELSE a.state
              END,
      finalized_at = CASE WHEN p.status <> 'pending' THEN coalesce(a.finalized_at, now())
                          ELSE a.finalized_at END
  FROM invoice_payments p
  WHERE a.invoice_id = p_invoice_id
    AND p.checkout_attempt_id = a.id
    AND a.state IN ('claimed','session_created','processing')
    AND p.status <> 'pending';

  SELECT * INTO v_attempt
  FROM invoice_checkout_attempts
  WHERE invoice_id = p_invoice_id
    AND state IN ('claimed','session_created','processing')
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.payer_id IS DISTINCT FROM p_payer_id
       OR v_attempt.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
      RAISE EXCEPTION 'invoice_checkout_attempt_payer_mismatch';
    END IF;

    -- A manual payment may have changed the authoritative remaining balance.
    IF v_attempt.amount_cents <> v_amount
       OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD')) THEN
      UPDATE invoice_payments
      SET status = 'failed',
          note = concat_ws(' ', note, 'Superseded because the invoice balance changed.')
      WHERE checkout_attempt_id = v_attempt.id AND status = 'pending';
      UPDATE invoice_checkout_attempts
      SET state = 'superseded', failure_reason = 'invoice_balance_changed',
          finalized_at = now()
      WHERE id = v_attempt.id;
      UPDATE invoices SET stripe_checkout_session_id = NULL
      WHERE id = p_invoice_id
        AND stripe_checkout_session_id = v_attempt.stripe_checkout_session_id;
      v_attempt.id := NULL;
    ELSE
      SELECT * INTO v_payment
      FROM invoice_payments WHERE checkout_attempt_id = v_attempt.id;
      IF NOT FOUND THEN
        -- Recover only from the complete attempt record; never guess by invoice.
        INSERT INTO invoice_payments (
          invoice_id, amount_cents, method, status,
          stripe_checkout_session_id, recorded_by, checkout_attempt_id,
          note
        ) VALUES (
          v_attempt.invoice_id, v_attempt.amount_cents, 'stripe', 'pending',
          v_attempt.stripe_checkout_session_id, v_attempt.payer_id, v_attempt.id,
          'Recovered from exact Checkout attempt.'
        ) RETURNING * INTO v_payment;
      ELSIF v_payment.status <> 'pending' THEN
        RAISE EXCEPTION 'invoice_checkout_attempt_terminal:%', v_payment.status;
      END IF;

      RETURN jsonb_build_object(
        'attempt_id', v_attempt.id,
        'payment_id', v_payment.id,
        'invoice_id', v_attempt.invoice_id,
        'payer_id', v_attempt.payer_id,
        'stripe_customer_id', v_attempt.stripe_customer_id,
        'amount_cents', v_attempt.amount_cents,
        'currency', v_attempt.currency,
        'state', v_attempt.state,
        'stripe_idempotency_key', v_attempt.stripe_idempotency_key,
        'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id
      );
    END IF;
  END IF;

  v_attempt_id := gen_random_uuid();
  INSERT INTO invoice_checkout_attempts (
    id, invoice_id, payer_id, stripe_customer_id, amount_cents, currency,
    state, stripe_idempotency_key
  ) VALUES (
    v_attempt_id, p_invoice_id, p_payer_id, p_stripe_customer_id,
    v_amount, lower(coalesce(v_invoice.currency, 'USD')),
    'claimed', 'invoice-checkout:' || v_attempt_id::text
  ) RETURNING * INTO v_attempt;

  INSERT INTO invoice_payments (
    invoice_id, amount_cents, method, status, recorded_by,
    checkout_attempt_id, note
  ) VALUES (
    p_invoice_id, v_amount, 'stripe', 'pending', p_payer_id,
    v_attempt.id, 'Checkout attempt claimed before Stripe session creation.'
  ) RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'payment_id', v_payment.id,
    'invoice_id', v_attempt.invoice_id,
    'payer_id', v_attempt.payer_id,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'amount_cents', v_attempt.amount_cents,
    'currency', v_attempt.currency,
    'state', v_attempt.state,
    'stripe_idempotency_key', v_attempt.stripe_idempotency_key,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_invoice_checkout_attempt(
  p_attempt_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id uuid;
  v_attempt invoice_checkout_attempts%ROWTYPE;
  v_payment invoice_payments%ROWTYPE;
BEGIN
  SELECT invoice_id INTO v_invoice_id
  FROM invoice_checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_checkout_attempt_not_found'; END IF;

  PERFORM 1 FROM invoices WHERE id = v_invoice_id FOR UPDATE;
  SELECT * INTO v_attempt
  FROM invoice_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;

  IF v_attempt.state NOT IN ('claimed','session_created','processing') THEN
    RAISE EXCEPTION 'invoice_checkout_attempt_not_active:%', v_attempt.state;
  END IF;
  IF v_attempt.payer_id IS DISTINCT FROM p_payer_id
     OR v_attempt.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RAISE EXCEPTION 'invoice_checkout_attempt_payer_mismatch';
  END IF;
  IF p_stripe_checkout_session_id IS NULL OR btrim(p_stripe_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'invoice_checkout_session_required';
  END IF;
  IF v_attempt.stripe_checkout_session_id IS NOT NULL
     AND v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id THEN
    RAISE EXCEPTION 'invoice_checkout_session_mismatch';
  END IF;

  SELECT * INTO v_payment
  FROM invoice_payments
  WHERE checkout_attempt_id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'pending'
     OR v_payment.invoice_id <> v_attempt.invoice_id
     OR v_payment.amount_cents <> v_attempt.amount_cents
     OR v_payment.recorded_by IS DISTINCT FROM v_attempt.payer_id THEN
    RAISE EXCEPTION 'invoice_checkout_payment_invariant_failed';
  END IF;

  UPDATE invoice_checkout_attempts
  SET stripe_checkout_session_id = p_stripe_checkout_session_id,
      state = CASE WHEN state = 'processing' THEN 'processing' ELSE 'session_created' END,
      finalized_at = coalesce(finalized_at, now())
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  UPDATE invoice_payments
  SET stripe_checkout_session_id = p_stripe_checkout_session_id
  WHERE id = v_payment.id
    AND (stripe_checkout_session_id IS NULL
         OR stripe_checkout_session_id = p_stripe_checkout_session_id)
  RETURNING * INTO v_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_checkout_payment_stamp_failed'; END IF;

  UPDATE invoices
  SET stripe_checkout_session_id = p_stripe_checkout_session_id,
      updated_at = now()
  WHERE id = v_attempt.invoice_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id, 'payment_id', v_payment.id,
    'invoice_id', v_attempt.invoice_id, 'payer_id', v_attempt.payer_id,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'amount_cents', v_attempt.amount_cents, 'currency', v_attempt.currency,
    'state', v_attempt.state,
    'stripe_idempotency_key', v_attempt.stripe_idempotency_key,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_invoice_checkout_attempt(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_invoice_checkout_attempt(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_invoice_checkout_attempt(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_reason text DEFAULT 'checkout_session_expired'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id uuid;
  v_attempt invoice_checkout_attempts%ROWTYPE;
BEGIN
  SELECT invoice_id INTO v_invoice_id
  FROM invoice_checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1 FROM invoices WHERE id = v_invoice_id FOR UPDATE;
  SELECT * INTO v_attempt
  FROM invoice_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;

  IF v_attempt.state = 'requires_refund' THEN
    RAISE EXCEPTION 'invoice_checkout_reconciliation_required';
  END IF;
  IF v_attempt.state NOT IN ('claimed','session_created','processing') THEN
    RETURN false;
  END IF;
  IF v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id THEN
    RAISE EXCEPTION 'invoice_checkout_session_mismatch';
  END IF;

  UPDATE invoice_payments
  SET status = 'failed', note = concat_ws(' ', note, p_reason)
  WHERE checkout_attempt_id = p_attempt_id AND status = 'pending';

  UPDATE invoice_checkout_attempts
  SET state = CASE WHEN p_reason = 'checkout_session_expired' THEN 'expired' ELSE 'failed' END,
      failure_reason = p_reason, finalized_at = now()
  WHERE id = p_attempt_id;

  UPDATE invoices SET stripe_checkout_session_id = NULL, updated_at = now()
  WHERE id = v_invoice_id
    AND stripe_checkout_session_id = p_stripe_checkout_session_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_invoice_checkout_attempt(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_invoice_checkout_attempt(uuid, text, text)
  TO service_role;

-- ── 4. Overpayment guard + exact settlement contract ──────────────────────

-- A signed Stripe session event may arrive after local closure in the narrow
-- window where Stripe created the session but finalize never persisted it.
-- This boundary records that exact evidence without making the attempt active
-- again or exposing the session as the invoice's current Checkout pointer.
CREATE OR REPLACE FUNCTION public.recover_invoice_checkout_session_evidence(
  p_attempt_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id uuid;
  v_attempt invoice_checkout_attempts%ROWTYPE;
  v_payment invoice_payments%ROWTYPE;
BEGIN
  SELECT invoice_id INTO v_invoice_id
  FROM invoice_checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_checkout_attempt_not_found'; END IF;

  PERFORM 1 FROM invoices WHERE id = v_invoice_id FOR UPDATE;
  SELECT * INTO v_attempt
  FROM invoice_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;

  IF v_attempt.state NOT IN ('failed','expired','superseded') THEN
    RAISE EXCEPTION 'invoice_checkout_evidence_recovery_not_terminal:%', v_attempt.state;
  END IF;
  IF v_attempt.payer_id IS DISTINCT FROM p_payer_id
     OR v_attempt.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RAISE EXCEPTION 'invoice_checkout_attempt_payer_mismatch';
  END IF;
  IF p_stripe_checkout_session_id IS NULL OR btrim(p_stripe_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'invoice_checkout_session_required';
  END IF;
  IF v_attempt.stripe_checkout_session_id IS NOT NULL
     AND v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id THEN
    RAISE EXCEPTION 'invoice_checkout_session_mismatch';
  END IF;

  SELECT * INTO v_payment
  FROM invoice_payments
  WHERE checkout_attempt_id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'failed'
     OR v_payment.method <> 'stripe'
     OR v_payment.invoice_id <> v_attempt.invoice_id
     OR v_payment.amount_cents <> v_attempt.amount_cents
     OR v_payment.recorded_by IS DISTINCT FROM v_attempt.payer_id
     OR (v_payment.stripe_checkout_session_id IS NOT NULL
         AND v_payment.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id) THEN
    RAISE EXCEPTION 'invoice_checkout_payment_invariant_failed';
  END IF;

  UPDATE invoice_checkout_attempts
  SET stripe_checkout_session_id = p_stripe_checkout_session_id,
      finalized_at = coalesce(finalized_at, now())
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  UPDATE invoice_payments
  SET stripe_checkout_session_id = p_stripe_checkout_session_id,
      note = concat_ws(
        ' ', note,
        'Exact signed Stripe session evidence recovered for refund/reconciliation only.'
      )
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id, 'payment_id', v_payment.id,
    'invoice_id', v_attempt.invoice_id, 'payer_id', v_attempt.payer_id,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'amount_cents', v_attempt.amount_cents, 'currency', v_attempt.currency,
    'state', v_attempt.state,
    'stripe_idempotency_key', v_attempt.stripe_idempotency_key,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text) IS
  'Service-only signed-webhook recovery for an exact terminal Checkout attempt whose session pointer never finalized. Stamps attempt/payment evidence atomically, leaves the attempt terminal, and never reopens the invoice pointer; a subsequent settlement is forced to requires_refund.';

CREATE OR REPLACE FUNCTION public.guard_invoice_payment_overpayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_other_paid bigint;
  v_attempt_state text;
BEGIN
  IF NEW.status <> 'succeeded' THEN RETURN NEW; END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.checkout_attempt_id IS NOT NULL THEN
    SELECT state INTO v_attempt_state
    FROM invoice_checkout_attempts
    WHERE id = NEW.checkout_attempt_id;
  END IF;

  SELECT coalesce(sum(amount_cents), 0) INTO v_other_paid
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id
    AND status = 'succeeded'
    AND id <> NEW.id;

  IF v_attempt_state IN ('failed','expired','superseded') THEN
    NEW.status := 'requires_refund';
    NEW.note := concat_ws(
      ' ', NEW.note,
      format(
        'Automatic application blocked: Stripe charged locally closed Checkout attempt %s in state %s; refund/reconciliation required.',
        NEW.checkout_attempt_id,
        v_attempt_state
      )
    );
  ELSIF v_invoice.status NOT IN ('sent','partially_paid')
     OR NEW.amount_cents > v_invoice.total_cents - v_other_paid THEN
    NEW.status := 'requires_refund';
    NEW.note := concat_ws(
      ' ', NEW.note,
      format(
        'Automatic application blocked: Stripe reported %s cents against %s cents remaining on invoice state %s; refund/reconciliation required.',
        NEW.amount_cents,
        greatest(v_invoice.total_cents - v_other_paid, 0),
        v_invoice.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_payment_overpayment()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_invoice_payment_overpayment() TO service_role;

CREATE TRIGGER guard_invoice_payment_overpayment
  BEFORE INSERT OR UPDATE OF status, amount_cents, invoice_id
  ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payment_overpayment();

CREATE OR REPLACE FUNCTION public.sync_invoice_checkout_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task agent_tasks%ROWTYPE;
BEGIN
  IF NEW.checkout_attempt_id IS NULL AND NEW.status <> 'requires_refund' THEN
    RETURN NEW;
  END IF;

  -- A blocked charge freezes every other local attempt on this invoice. Those
  -- Stripe URLs may already exist externally, so any later charge on one is
  -- independently classified requires_refund by the same invoice lock/guard.
  IF NEW.status = 'requires_refund' THEN
    UPDATE invoice_checkout_attempts
    SET state = 'failed', failure_reason = 'invoice_reconciliation_required',
        finalized_at = coalesce(finalized_at, now())
    WHERE invoice_id = NEW.invoice_id
      AND (NEW.checkout_attempt_id IS NULL OR id <> NEW.checkout_attempt_id)
      AND state IN ('claimed','session_created','processing');

    UPDATE invoice_payments
    SET status = 'failed',
        note = concat_ws(' ', note, 'Closed because another charge requires invoice reconciliation.')
    WHERE invoice_id = NEW.invoice_id
      AND id <> NEW.id
      AND status = 'pending'
      AND method = 'stripe';
  END IF;

  IF NEW.checkout_attempt_id IS NOT NULL THEN
    UPDATE invoice_checkout_attempts
    SET state = CASE
          WHEN NEW.status = 'requires_refund' THEN 'requires_refund'
          WHEN NEW.status = 'succeeded' THEN 'succeeded'
          WHEN NEW.status = 'failed' THEN 'failed'
          WHEN NEW.status = 'refunded' THEN 'refunded'
          WHEN NEW.stripe_payment_intent_id IS NOT NULL THEN 'processing'
          WHEN NEW.stripe_checkout_session_id IS NOT NULL THEN 'session_created'
          ELSE state
        END,
        stripe_checkout_session_id = coalesce(
          invoice_checkout_attempts.stripe_checkout_session_id,
          NEW.stripe_checkout_session_id
        ),
        stripe_payment_intent_id = coalesce(
          invoice_checkout_attempts.stripe_payment_intent_id,
          NEW.stripe_payment_intent_id
        ),
        finalized_at = CASE
          WHEN NEW.status IN ('succeeded','failed','refunded','requires_refund')
            THEN coalesce(invoice_checkout_attempts.finalized_at, now())
          ELSE invoice_checkout_attempts.finalized_at
        END
    WHERE id = NEW.checkout_attempt_id;
  END IF;

  IF NEW.status IN ('failed','refunded') THEN
    UPDATE invoices SET stripe_checkout_session_id = NULL, updated_at = now()
    WHERE id = NEW.invoice_id
      AND stripe_checkout_session_id = NEW.stripe_checkout_session_id;
  ELSIF NEW.status = 'requires_refund' THEN
    v_task := public.enqueue_agent_task(
      p_task_type => 'payment_discrepancy',
      p_payload => jsonb_build_object(
        'invoice_id', NEW.invoice_id,
        'invoice_payment_id', NEW.id,
        'checkout_attempt_id', NEW.checkout_attempt_id,
        'stripe_checkout_session_id', NEW.stripe_checkout_session_id,
        'stripe_payment_intent_id', NEW.stripe_payment_intent_id,
        'charged_cents', NEW.amount_cents,
        'required_action', 'refund_and_reconcile',
        'verdict', 'Stripe charge was not applied because it exceeds the authoritative invoice balance or the invoice is no longer payable.'
      ),
      p_source => 'stripe-webhook',
      p_priority => 1,
      p_entity_type => 'invoice_payment',
      p_entity_id => NEW.id,
      p_idempotency_key => 'invoice-overpayment:' || NEW.id::text,
      p_summary => 'Refund/reconcile blocked invoice overpayment',
      p_status => 'awaiting_review',
      p_actor => 'stripe-webhook:invoice-overpayment-guard'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_checkout_attempt()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_checkout_attempt() TO service_role;

CREATE TRIGGER sync_invoice_checkout_attempt_on_payment
  AFTER INSERT OR UPDATE OF status, stripe_checkout_session_id, stripe_payment_intent_id
  ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_checkout_attempt();

CREATE OR REPLACE FUNCTION public.settle_invoice_checkout_payment(
  p_payment_id uuid,
  p_stripe_event_id text,
  p_stripe_payment_intent_id text,
  p_reported_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id uuid;
  v_payment invoice_payments%ROWTYPE;
  v_result invoice_payments%ROWTYPE;
  v_target_status text;
  v_reason text;
BEGIN
  SELECT invoice_id INTO v_invoice_id FROM invoice_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_checkout_payment_not_found'; END IF;

  PERFORM 1 FROM invoices WHERE id = v_invoice_id FOR UPDATE;
  SELECT * INTO v_payment FROM invoice_payments WHERE id = p_payment_id FOR UPDATE;

  IF v_payment.method <> 'stripe' THEN
    RAISE EXCEPTION 'invoice_checkout_payment_not_stripe';
  END IF;
  IF v_payment.status IN ('succeeded','requires_refund','refunded') THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id, 'invoice_id', v_payment.invoice_id,
      'outcome', v_payment.status, 'changed', false,
      'amount_cents', v_payment.amount_cents
    );
  END IF;

  IF p_reported_amount_cents IS NULL
     OR p_reported_amount_cents <> v_payment.amount_cents THEN
    v_target_status := 'requires_refund';
    v_reason := format(
      'Stripe-reported amount %s does not match claimed payment amount %s; refund/reconciliation required.',
      coalesce(p_reported_amount_cents::text, 'NULL'), v_payment.amount_cents
    );
  ELSE
    v_target_status := 'succeeded';
    v_reason := NULL;
  END IF;

  UPDATE invoice_payments
  SET status = v_target_status,
      received_at = now(),
      stripe_event_id = p_stripe_event_id,
      stripe_payment_intent_id = coalesce(
        invoice_payments.stripe_payment_intent_id,
        p_stripe_payment_intent_id
      ),
      note = CASE WHEN v_reason IS NULL THEN note ELSE concat_ws(' ', note, v_reason) END
  WHERE id = p_payment_id
    AND status IN ('pending','failed')
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    SELECT * INTO v_result FROM invoice_payments WHERE id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_result.id, 'invoice_id', v_result.invoice_id,
    'outcome', v_result.status,
    'changed', v_payment.status IS DISTINCT FROM v_result.status,
    'amount_cents', v_result.amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer) IS
  'Service-only webhook settlement boundary. Locks the invoice, verifies the exact claimed amount, and relies on guard_invoice_payment_overpayment to turn late/excess charges into requires_refund plus an awaiting-review reconciliation task.';
