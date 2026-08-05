-- ══════════════════════════════════════════════════════════════════════════
-- 00428 — Invoice payment-method chooser + inline surcharge (ACH / card / check)
--
-- The client picks the rail BEFORE Checkout: ACH (preferred), card, or mail a
-- check. A surcharge rides along with the online rails and is modelled HERE, in
-- the database, because the 00397 invoice-checkout rail asserts the exact
-- claimed amount at three checkpoints. A surcharge bolted onto Stripe alone
-- would trip every one of them and brick the invoice.
--
-- Money invariants (do not drift):
--   * invoice_payments.amount_cents stays the pure invoice-applied balance.
--     surcharge_cents is a SEPARATE column. Charged gross = amount + surcharge.
--     Consequence: apply_invoice_payment_effects (head 00277),
--     guard_invoice_payment_overpayment, and every rollup/refund/earnings
--     consumer are untouched — and `method` stays 'stripe' (00277's earnings
--     CASE branches on it; never add method values).
--   * ONE rounding formula, exact integer half-up, lives in
--     invoice_payment_surcharge_cents:  (cents::bigint * bps + 5000) / 10000
--     The bigint cast is MANDATORY — int4 overflows above ~$71.6k invoices.
--     ACH = LEAST(formula(cents, 80), 500). Card = formula(cents, studio bps),
--     bps CHECK 0..300, default 300. The TypeScript twin is
--     packages/shared/src/invoice/index.ts — keep them in lockstep.
--   * The legacy / no-method path is preserved byte-for-byte: a caller that
--     omits p_payment_method gets NULL → surcharge 0 → today's exact behavior.
--     Required, because iOS calls create-checkout-session with {invoiceId} only.
--
-- Function lineage (all four are sole definitions from 00397 — verified by
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql):
--   claim_invoice_checkout_attempt            00397 → 00428  (signature changed)
--   finalize_invoice_checkout_attempt         00397 → 00428
--   recover_invoice_checkout_session_evidence 00397 → 00428
--   settle_invoice_checkout_payment           00397 → 00428  (signature changed)
-- Bodies below were copied verbatim from 00397 and the deltas grafted on top.
--
-- Deploy order matters: migration FIRST, then edge functions, then portals.
-- Both new RPC parameters carry DEFAULT NULL so the currently deployed edge
-- code keeps resolving the old 4-argument call shape while it rolls forward.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Per-studio billing settings ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.studio_billing_settings (
  studio_id          uuid PRIMARY KEY
                       REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_surcharge_bps integer NOT NULL DEFAULT 300
                       CONSTRAINT chk_studio_billing_card_bps_range
                       CHECK (card_surcharge_bps >= 0 AND card_surcharge_bps <= 300),
  check_remit_to     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_studio_billing_settings_updated_at
  ON public.studio_billing_settings;
CREATE TRIGGER set_studio_billing_settings_updated_at
  BEFORE UPDATE ON public.studio_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_billing_settings ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper discipline (00316/00417): every policy predicate is a
-- definer helper, and every policy is TO authenticated — a policy that reaches
-- organization_members directly re-enters that table's own RLS and 42501s.
DROP POLICY IF EXISTS studio_billing_settings_member_select ON public.studio_billing_settings;
CREATE POLICY studio_billing_settings_member_select
  ON public.studio_billing_settings
  FOR SELECT TO authenticated
  USING (public.is_active_studio_member(studio_id));

DROP POLICY IF EXISTS studio_billing_settings_admin_insert ON public.studio_billing_settings;
CREATE POLICY studio_billing_settings_admin_insert
  ON public.studio_billing_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

DROP POLICY IF EXISTS studio_billing_settings_admin_update ON public.studio_billing_settings;
CREATE POLICY studio_billing_settings_admin_update
  ON public.studio_billing_settings
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id))
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

-- No DELETE policy: settings are edited, never removed (the row dies with the org).

REVOKE ALL ON TABLE public.studio_billing_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_billing_settings TO authenticated;
GRANT ALL ON TABLE public.studio_billing_settings TO service_role;

COMMENT ON TABLE public.studio_billing_settings IS
  'Per-studio invoice payment settings. One row per organization; absence means the platform defaults (card 300 bps, no remit-to on file).';
COMMENT ON COLUMN public.studio_billing_settings.card_surcharge_bps IS
  'Card surcharge in basis points, 0..300. The 300 ceiling is the card-network cap (3%); some US states restrict surcharging further — a studio that cannot surcharge sets 0.';
COMMENT ON COLUMN public.studio_billing_settings.check_remit_to IS
  'Free-text mailing address shown to a client who chooses to mail a check. NULL falls back to portal copy telling the client to contact the designer.';

-- ── 2. Checkout attempts carry the chosen rail + its fee ──────────────────

ALTER TABLE public.invoice_checkout_attempts
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_checkout_attempts
  DROP CONSTRAINT IF EXISTS chk_invoice_checkout_payment_method;
ALTER TABLE public.invoice_checkout_attempts
  ADD CONSTRAINT chk_invoice_checkout_payment_method
  CHECK (payment_method IS NULL OR payment_method IN ('card','us_bank_account'));

ALTER TABLE public.invoice_checkout_attempts
  DROP CONSTRAINT IF EXISTS chk_invoice_checkout_surcharge_nonneg;
ALTER TABLE public.invoice_checkout_attempts
  ADD CONSTRAINT chk_invoice_checkout_surcharge_nonneg
  CHECK (surcharge_cents >= 0);

COMMENT ON COLUMN public.invoice_checkout_attempts.payment_method IS
  'Stripe payment_method_type this attempt is restricted to. NULL = legacy/no-method attempt that offers card and ACH together and carries no surcharge.';
COMMENT ON COLUMN public.invoice_checkout_attempts.surcharge_cents IS
  'Processing fee charged ON TOP of amount_cents. Stripe amount_total must equal amount_cents + surcharge_cents.';

-- ── 3. Payments record the fee and the rail actually used ─────────────────

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_type text;

ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS chk_invoice_payments_surcharge_nonneg;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT chk_invoice_payments_surcharge_nonneg
  CHECK (surcharge_cents >= 0);

ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS chk_invoice_payments_pm_type;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT chk_invoice_payments_pm_type
  CHECK (stripe_payment_method_type IS NULL
         OR stripe_payment_method_type IN ('card','us_bank_account'));

-- NOTE: invoice_payments.method is deliberately NOT touched. 00277's earnings
-- CASE branches on method='stripe'; the rail lives in stripe_payment_method_type.

COMMENT ON COLUMN public.invoice_payments.surcharge_cents IS
  'Processing fee the payer was charged on top of amount_cents. NEVER enters invoice balance, earnings, or rollups — amount_cents remains the invoice-applied amount.';
COMMENT ON COLUMN public.invoice_payments.stripe_payment_method_type IS
  'Rail actually used, stamped at settlement from the Stripe event (falling back to the claimed attempt). NULL for legacy/manual rows.';

-- ── 4. The single home of the rounding formula ────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_payment_surcharge_cents(
  p_amount_cents integer,
  p_method text,
  p_card_bps integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_amount_cents IS NULL OR p_amount_cents <= 0 THEN 0
    -- ACH: 0.8% capped at $5.00 passthrough (platform formula, not per-studio).
    WHEN p_method = 'us_bank_account' THEN
      LEAST(((p_amount_cents::bigint * 80 + 5000) / 10000)::integer, 500)
    -- Card: per-studio bps, half-up. bigint cast prevents int4 overflow.
    WHEN p_method = 'card' THEN
      GREATEST(
        ((p_amount_cents::bigint * COALESCE(p_card_bps, 300) + 5000) / 10000)::integer,
        0
      )
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.invoice_payment_surcharge_cents(integer, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_payment_surcharge_cents(integer, text, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.invoice_payment_surcharge_cents(integer, text, integer) IS
  'The single server-side home of the surcharge formula: exact integer half-up ((cents*bps + 5000)/10000) on a bigint product, ACH fixed at 80 bps capped at 500. Any other method (including NULL) is 0. LOCKSTEP TWIN: onlineSurchargeCents in packages/shared/src/invoice/index.ts — change both or money drifts between the button and the charge.';

-- ── 5. claim_invoice_checkout_attempt — body from 00397:1484-1653 + deltas ─
--
-- Signature changes (new trailing p_payment_method), so the old 4-argument
-- function is DROPped rather than replaced: leaving both would make the
-- 4-argument PostgREST call ambiguous. DEFAULT NULL keeps the currently
-- deployed edge function working until it is redeployed.

DROP FUNCTION IF EXISTS public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.claim_invoice_checkout_attempt(
  p_invoice_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_allow_designer_test boolean DEFAULT false,
  p_payment_method text DEFAULT NULL
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
  v_card_bps      integer;
  v_surcharge     integer;
  v_supersede_reason text;
  v_superseded_session text;
BEGIN
  IF p_payment_method IS NOT NULL
     AND p_payment_method NOT IN ('card','us_bank_account') THEN
    RAISE EXCEPTION 'invoice_checkout_bad_payment_method:%', p_payment_method;
  END IF;

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

  -- The fee rides on top of the authoritative balance; amount_cents stays pure.
  SELECT card_surcharge_bps INTO v_card_bps
  FROM studio_billing_settings
  WHERE studio_id = v_invoice.studio_id;
  v_card_bps := coalesce(v_card_bps, 300);
  v_surcharge := public.invoice_payment_surcharge_cents(
    v_amount, p_payment_method, v_card_bps
  );

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

    -- A manual payment may have changed the authoritative remaining balance,
    -- or the payer may have switched rails (which changes the Stripe session's
    -- allowed method AND its total) — either way the live attempt is stale.
    IF v_attempt.amount_cents <> v_amount
       OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
       OR v_attempt.payment_method IS DISTINCT FROM p_payment_method
       OR v_attempt.surcharge_cents <> v_surcharge THEN
      v_supersede_reason := CASE
        WHEN v_attempt.amount_cents <> v_amount
             OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
          THEN 'invoice_balance_changed'
        ELSE 'payment_method_changed'
      END;
      v_superseded_session := v_attempt.stripe_checkout_session_id;

      UPDATE invoice_payments
      SET status = 'failed',
          note = concat_ws(' ', note, CASE
            WHEN v_supersede_reason = 'payment_method_changed'
              THEN 'Superseded because the payer changed payment method.'
            ELSE 'Superseded because the invoice balance changed.'
          END)
      WHERE checkout_attempt_id = v_attempt.id AND status = 'pending';
      UPDATE invoice_checkout_attempts
      SET state = 'superseded', failure_reason = v_supersede_reason,
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
          invoice_id, amount_cents, surcharge_cents, method, status,
          stripe_checkout_session_id, recorded_by, checkout_attempt_id,
          note
        ) VALUES (
          v_attempt.invoice_id, v_attempt.amount_cents, v_attempt.surcharge_cents,
          'stripe', 'pending',
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
        'surcharge_cents', v_attempt.surcharge_cents,
        'payment_method', v_attempt.payment_method,
        'superseded_session_id', NULL::text,
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
    state, stripe_idempotency_key, payment_method, surcharge_cents
  ) VALUES (
    v_attempt_id, p_invoice_id, p_payer_id, p_stripe_customer_id,
    v_amount, lower(coalesce(v_invoice.currency, 'USD')),
    'claimed', 'invoice-checkout:' || v_attempt_id::text,
    p_payment_method, v_surcharge
  ) RETURNING * INTO v_attempt;

  INSERT INTO invoice_payments (
    invoice_id, amount_cents, surcharge_cents, method, status, recorded_by,
    checkout_attempt_id, note
  ) VALUES (
    p_invoice_id, v_amount, v_surcharge, 'stripe', 'pending', p_payer_id,
    v_attempt.id, 'Checkout attempt claimed before Stripe session creation.'
  ) RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'payment_id', v_payment.id,
    'invoice_id', v_attempt.invoice_id,
    'payer_id', v_attempt.payer_id,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'amount_cents', v_attempt.amount_cents,
    'surcharge_cents', v_attempt.surcharge_cents,
    'payment_method', v_attempt.payment_method,
    'superseded_session_id', v_superseded_session,
    'currency', v_attempt.currency,
    'state', v_attempt.state,
    'stripe_idempotency_key', v_attempt.stripe_idempotency_key,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text)
  TO service_role;

COMMENT ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text) IS
  'Service-only Checkout claim. amount_cents is the authoritative invoice balance; surcharge_cents is the fee for the chosen rail (NULL method = legacy, no surcharge, both rails offered). A live attempt whose balance, currency, rail, or fee no longer matches is superseded (failure_reason invoice_balance_changed | payment_method_changed) and its Stripe session id returned as superseded_session_id so the caller can expire it.';

-- ── 6. finalize + recover — 00397 bodies + surcharge invariant/echo ────────

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
     OR v_payment.surcharge_cents <> v_attempt.surcharge_cents
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
    'amount_cents', v_attempt.amount_cents,
    'surcharge_cents', v_attempt.surcharge_cents,
    'payment_method', v_attempt.payment_method,
    'currency', v_attempt.currency,
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
     OR v_payment.surcharge_cents <> v_attempt.surcharge_cents
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
    'amount_cents', v_attempt.amount_cents,
    'surcharge_cents', v_attempt.surcharge_cents,
    'payment_method', v_attempt.payment_method,
    'currency', v_attempt.currency,
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

-- ── 7. settle_invoice_checkout_payment — the amount contract goes GROSS ────
--
-- Stripe reports what it charged: amount_cents + surcharge_cents. The exactness
-- guarantee is unchanged, only its arithmetic — a legacy attempt has
-- surcharge_cents = 0, so the old assertion is preserved bit for bit.
-- Signature changes (new trailing p_stripe_payment_method_type) → DROP + CREATE.

DROP FUNCTION IF EXISTS public.settle_invoice_checkout_payment(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.settle_invoice_checkout_payment(
  p_payment_id uuid,
  p_stripe_event_id text,
  p_stripe_payment_intent_id text,
  p_reported_amount_cents integer,
  p_stripe_payment_method_type text DEFAULT NULL
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
  v_expected_gross integer;
  v_attempt_method text;
  v_reported_method text;
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
      'amount_cents', v_payment.amount_cents,
      'surcharge_cents', v_payment.surcharge_cents,
      'stripe_payment_method_type', v_payment.stripe_payment_method_type
    );
  END IF;

  -- Only the two rails we model may be stamped; anything else Stripe reports is
  -- ignored rather than raised, so an unexpected value never blocks settlement.
  v_reported_method := CASE
    WHEN p_stripe_payment_method_type IN ('card','us_bank_account')
      THEN p_stripe_payment_method_type
    ELSE NULL
  END;
  SELECT payment_method INTO v_attempt_method
  FROM invoice_checkout_attempts
  WHERE id = v_payment.checkout_attempt_id;

  v_expected_gross := v_payment.amount_cents + v_payment.surcharge_cents;
  IF p_reported_amount_cents IS NULL
     OR p_reported_amount_cents <> v_expected_gross THEN
    v_target_status := 'requires_refund';
    v_reason := format(
      'Stripe-reported amount %s does not match claimed payment amount %s + surcharge %s (= %s); refund/reconciliation required.',
      coalesce(p_reported_amount_cents::text, 'NULL'),
      v_payment.amount_cents, v_payment.surcharge_cents, v_expected_gross
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
      stripe_payment_method_type = coalesce(
        invoice_payments.stripe_payment_method_type,
        v_reported_method,
        v_attempt_method
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
    'amount_cents', v_result.amount_cents,
    'surcharge_cents', v_result.surcharge_cents,
    'stripe_payment_method_type', v_result.stripe_payment_method_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer, text)
  TO service_role;

COMMENT ON FUNCTION public.settle_invoice_checkout_payment(uuid, text, text, integer, text) IS
  'Service-only webhook settlement boundary. Locks the invoice and verifies the GROSS charged amount (claimed amount_cents + surcharge_cents) against what Stripe reported; guard_invoice_payment_overpayment still turns late/excess charges into requires_refund plus an awaiting-review reconciliation task. Stamps the rail actually used, falling back to the claimed attempt.';

-- ── 8. Client-visible payment options ─────────────────────────────────────
--
-- SECURITY DEFINER so a client (who cannot read studio_billing_settings — that
-- table is member-gated) can see the fee they are about to be charged. Precedent:
-- resolve_studio_identity (00320). Every denial is 'invoice_not_found' so the RPC
-- never confirms that an invoice exists to someone who may not see it.

CREATE OR REPLACE FUNCTION public.get_invoice_payment_options(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_invoice invoices%ROWTYPE;
  v_project_client uuid;
  v_bps integer;
  v_remit text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND OR v_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT client_id INTO v_project_client
  FROM projects WHERE id = v_invoice.project_id;

  IF NOT (
    v_uid = coalesce(v_invoice.client_id, v_project_client)
    OR v_uid = v_invoice.designer_id
    OR public.is_active_studio_member(v_invoice.studio_id)
  ) THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT card_surcharge_bps, check_remit_to INTO v_bps, v_remit
  FROM studio_billing_settings
  WHERE studio_id = v_invoice.studio_id;

  RETURN jsonb_build_object(
    'card_surcharge_bps', coalesce(v_bps, 300),
    'check_remit_to', v_remit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_payment_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_payment_options(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_invoice_payment_options(uuid) IS
  'Payment options for one non-draft invoice, readable by its client, its designer, or an active member of its studio. Returns {card_surcharge_bps, check_remit_to}, defaulting to {300, null} when the studio has no settings row or the invoice has no studio. Every denial raises invoice_not_found so existence is never confirmed.';


-- ── 9. sync_invoice_checkout_attempt — the discrepancy task reports GROSS ──
--
-- Body copied verbatim from its sole prior head (00397:1958-2047); the ONLY
-- change is inside the payment_discrepancy payload. That task tells an operator
-- how much money Stripe is holding so they can refund it — and since 00428 the
-- charge is amount_cents + surcharge_cents, reporting the net alone would send
-- them to refund the wrong number. `charged_cents` becomes the gross and
-- `surcharge_cents` is broken out beside it so the two parts stay legible.
-- A legacy payment has surcharge_cents = 0, so its task is unchanged.

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
        -- GROSS: what Stripe actually holds (00428). The operator refunds this.
        'charged_cents', NEW.amount_cents + NEW.surcharge_cents,
        -- Broken out so the invoice-applied part and the rail fee stay legible.
        'surcharge_cents', NEW.surcharge_cents,
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

-- Same signature (a zero-argument trigger function), so the 00397 trigger keeps
-- pointing at it — but the grants are re-issued because CREATE OR REPLACE on a
-- fresh stack must not depend on what a previous migration left behind.
REVOKE ALL ON FUNCTION public.sync_invoice_checkout_attempt()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_checkout_attempt() TO service_role;

COMMENT ON FUNCTION public.sync_invoice_checkout_attempt() IS
  'AFTER-write mirror from invoice_payments onto its checkout attempt, plus the requires_refund fan-out. The payment_discrepancy agent task reports charged_cents as the GROSS Stripe holds (amount_cents + surcharge_cents) with surcharge_cents broken out (00428).';
