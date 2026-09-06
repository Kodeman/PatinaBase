-- ═══════════════════════════════════════════════════════════════════════════
-- 00574 — The Invoice, Standing Alone: invoice links + the guest checkout rail
--
-- A public, account-less invoice page (client.patina.cloud/pay/<token>) needs
-- three things from the database: (1) one permanent 256-bit bearer token per
-- issued invoice, (2) a Checkout attempt that can belong to a LINK rather than
-- to a signed-in payer — a rostered household with no profile is the feature's
-- core population, not an edge — and (3) every money RPC that reads payer
-- identity treating that link as a first-class identity term (K4).
--
-- Lineage of the re-headed bodies (anchored grep, verified 2026-09-06 —
-- 00428 is the sole later body of each; 00397's void body has no later body):
--   claim_invoice_checkout_attempt            00397 → 00428 → 00574
--     'actor_changed' becomes a supersede reason BELOW the balance/rail
--     branch: the household path supersedes a guest's stale attempt instead
--     of raising invoice_checkout_attempt_payer_mismatch (M3).
--   claim_invoice_link_checkout_attempt       NEW — sibling grafted from
--     00428:190-397 with the link identity; leaves the pinned 5-arg
--     household signature untouched.
--   finalize_invoice_checkout_attempt         00397 → 00428 → 00574
--   recover_invoice_checkout_session_evidence 00397 → 00428 → 00574
--     both gain p_invoice_link_id so a link attempt keeps a real identity
--     term instead of degenerating to NULL-vs-NULL (M4). DROP + CREATE
--     because the signature grows (00571:1316 idiom, avoids 42725).
--   _void_invoice_authorized_legacy_00397     00397:1271-1357 (renamed at
--     :1449; public.void_invoice is the authority wrapper) → 00574
--     closes the link and refuses while an attempt is processing (M9/M10).
--   expire_stale_invoice_checkout_attempts    NEW — shaped on
--     groom_agent_tasks (00300:78-199): advisory lock, job_runs row, sweep.
-- Reconciles: none.
--
-- Rulings folded in: K4 (link identity everywhere payer_id is one), K5 (void
-- → withdrawn sheet; settling while money is in flight), K6 (the client
-- portal host), K7 (no expiry — no expires_at, no predicate), T4 M1–M12,
-- S5 (get_invoice_link gate), S6, S10 (return nonce on BOTH rails so the
-- token never reaches Stripe's retained logs), S13, S15, S16.
--
-- Review pass (delivery/reviews/w1-review.md): F1 a processing attempt is
-- never superseded by a different actor (both claims raise
-- invoice_checkout_in_progress); F2 a return nonce resolves only to a link
-- that existed when its attempt was claimed; F3 pay.processing / payments[]
-- count only PaymentIntent-stamped pending rows; F9 the void body writes the
-- attempt before its payment so failure_reason = 'invoice_voided' lands;
-- F13 with INVOICE_CHECKOUT_DESIGNER_TEST_MODE a designer's test claim now
-- supersedes a household's live session (actor_changed) where 00428 raised
-- payer_mismatch — JWT path, Stripe test key only, accepted; F14 the
-- checkout resolver returns client_display_name so the link customer is
-- named; F5 (ruled) the guest rail ALWAYS pays as the link — the resolver's
-- payer_id is informational (the household, for the F1/M3 actor comparison)
-- and never picks a Stripe customer; only the signed-in rail pays as the
-- household profile. Payload additions for W2: studio.location
-- (organizations.address city/state) and line_items[].attribution (FF&E
-- maker name, never an id).
--
-- Rollback (each alone): DROP TRIGGER invoice_link_mint_on_issue ON
-- public.invoices freezes minting without breaking a link;
-- cron.unschedule('invoice-checkout-attempts-expire') stops the sweep.
-- payer_id DROP NOT NULL is a widening and is not reversed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. invoice_links — the permanent bearer credential ────────────────────
--
-- Raw token, no hash (T2b note 1): four server producers must re-emit the SAME
-- link for the invoice's life, and the table's posture — RLS on, zero
-- policies, every grant revoked from PUBLIC/anon/authenticated — is the
-- protection. Three statuses: active (payable / receipt), revoked
-- (Regenerate), closed (void_invoice — the row records the death rather than
-- leaving it a predicate inside one resolver).

CREATE TABLE IF NOT EXISTS public.invoice_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token              text NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  -- Link-payer branch only: the Stripe Customer minted for a payer with no
  -- profile. Compare-and-set by set_invoice_link_stripe_customer.
  stripe_customer_id text,
  -- Captured from Checkout's customer_details at checkout.session.completed
  -- (M5) so a receipt can actually reach the person who paid.
  payer_email        text,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  view_count         integer NOT NULL DEFAULT 0,
  last_viewed_at     timestamptz,
  CONSTRAINT chk_invoice_links_status CHECK (status IN ('active','revoked','closed')),
  CONSTRAINT chk_invoice_links_token  CHECK (token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_invoice_links_dead
    CHECK ((status <> 'active') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_links_token
  ON public.invoice_links(token);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_links_active
  ON public.invoice_links(invoice_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoice_links_invoice
  ON public.invoice_links(invoice_id);

ALTER TABLE public.invoice_links ENABLE ROW LEVEL SECURITY;   -- no policies, deliberately
REVOKE ALL ON TABLE public.invoice_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoice_links TO service_role;

COMMENT ON TABLE public.invoice_links IS
  'The Invoice, Standing Alone (00574): one permanent bearer token per issued invoice, read at /pay/<token>. RLS on with zero policies; every read goes through resolve_invoice_link / get_invoice_link and every write through an RPC. status: active | revoked (Regenerate) | closed (void). No expiry (K7).';
COMMENT ON COLUMN public.invoice_links.view_count IS
  'Support diagnostics only — never surfaced to the studio (V3).';

-- ── 2. The mint trigger — every issue path is an UPDATE of invoices.status ─
--
-- issue_invoice (00318:181-190), app_private.issue_invoice_for_actor
-- (00511:4071-4080, which duplicates rather than delegates), the trade-draw
-- and executed-on-paper paths (they INSERT draft then PERFORM issue_invoice)
-- and apply_invoice_payment_effects (00571, which can move a draft straight to
-- partially_paid) all write status through UPDATE, so one trigger covers them
-- all and no monolith is re-headed for it.

CREATE OR REPLACE FUNCTION public.mint_invoice_link_on_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.invoice_links (invoice_id, token, created_by)
  VALUES (
    NEW.id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    (SELECT pr.id FROM public.profiles pr WHERE pr.id = NEW.designer_id)
  )
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- M12: this trigger sits on the money path. A missing link is recoverable
  -- via ensure_invoice_link; a failed payment settlement is not.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_invoice_link_on_issue()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS invoice_link_mint_on_issue ON public.invoices;
CREATE TRIGGER invoice_link_mint_on_issue
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status IN ('sent','partially_paid','paid')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.mint_invoice_link_on_issue();

-- ── 3. Backfill — every open or paid invoice gets its link now ────────────

INSERT INTO public.invoice_links (invoice_id, token, created_by)
SELECT i.id,
       encode(extensions.gen_random_bytes(32), 'hex'),
       (SELECT pr.id FROM public.profiles pr WHERE pr.id = i.designer_id)
FROM public.invoices i
WHERE i.status IN ('sent','partially_paid','paid')
ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;

-- ── 4. invoice_checkout_attempts — the discriminated union + return nonce ─
--
-- Exactly one of payer_id / invoice_link_id: an exclusive-or, not a
-- disjunction (T4 "a real discriminated union"). uniq_invoice_checkout_active_
-- attempt (00397:58-60) is untouched, so one live attempt per invoice across
-- both rails. The state CHECK already carries expired and superseded.
--
-- return_nonce (S10): 32 random bytes hex, single-purpose, valid for the
-- attempt's life. Stripe's success/cancel URLs carry the nonce, never the
-- token, on BOTH rails.

ALTER TABLE public.invoice_checkout_attempts
  ADD COLUMN IF NOT EXISTS invoice_link_id uuid
    REFERENCES public.invoice_links(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS return_nonce text;

ALTER TABLE public.invoice_checkout_attempts
  ALTER COLUMN payer_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_invoice_attempt_actor'
      AND conrelid = 'public.invoice_checkout_attempts'::regclass
  ) THEN
    ALTER TABLE public.invoice_checkout_attempts
      ADD CONSTRAINT chk_invoice_attempt_actor
      CHECK ((payer_id IS NOT NULL) <> (invoice_link_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_invoice_attempt_nonce'
      AND conrelid = 'public.invoice_checkout_attempts'::regclass
  ) THEN
    ALTER TABLE public.invoice_checkout_attempts
      ADD CONSTRAINT chk_invoice_attempt_nonce
      CHECK (return_nonce IS NULL OR return_nonce ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_attempt_return_nonce
  ON public.invoice_checkout_attempts(return_nonce)
  WHERE return_nonce IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_checkout_attempts_link
  ON public.invoice_checkout_attempts(invoice_link_id)
  WHERE invoice_link_id IS NOT NULL;

COMMENT ON COLUMN public.invoice_checkout_attempts.invoice_link_id IS
  'The link this attempt belongs to when no signed-in payer does (00574). Exactly one of payer_id / invoice_link_id is set.';
COMMENT ON COLUMN public.invoice_checkout_attempts.return_nonce IS
  'Single-purpose 64-hex nonce Stripe returns the payer through (/pay/return/<nonce>) so the permanent link token never enters Stripe''s retained logs (S10).';

-- ── 5. claim_invoice_checkout_attempt — 00428 body + actor_changed (M3) ───
--
-- Body copied verbatim from 00428:190-397; the delta is the supersede branch.
-- Signature unchanged, so the pinned literal (uuid,uuid,text,boolean,text)
-- in invoice_checkout_integrity_test.sql stays valid.

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
  v_actor_changed boolean;
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
    -- 00574 (M3): a different actor on the live attempt — a guest who opened
    -- a link Checkout and walked away, or the household after a guest — is a
    -- supersede reason, not an error. Before the link rail only the household
    -- could claim, so the old RAISE here was unreachable; with it, one
    -- stranger could lock the household out of its own invoice for good.
    v_actor_changed :=
      v_attempt.payer_id IS DISTINCT FROM p_payer_id
      OR v_attempt.invoice_link_id IS NOT NULL
      OR v_attempt.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id;

    -- Review F1: money in flight is never superseded. A processing attempt
    -- carries a stamped PaymentIntent — a bank debit already initiated — so a
    -- different actor waits, exactly as void_invoice does (M10). The rail /
    -- balance supersede on a same-actor processing attempt is 00428's and is
    -- deliberately not widened here.
    IF v_attempt.state = 'processing' AND v_actor_changed THEN
      RAISE EXCEPTION 'invoice_checkout_in_progress';
    END IF;

    -- A manual payment may have changed the authoritative remaining balance,
    -- or the payer may have switched rails (which changes the Stripe session's
    -- allowed method AND its total) — either way the live attempt is stale.
    IF v_attempt.amount_cents <> v_amount
       OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
       OR v_attempt.payment_method IS DISTINCT FROM p_payment_method
       OR v_attempt.surcharge_cents <> v_surcharge
       OR v_actor_changed THEN
      v_supersede_reason := CASE
        WHEN v_attempt.amount_cents <> v_amount
             OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
          THEN 'invoice_balance_changed'
        WHEN v_attempt.payment_method IS DISTINCT FROM p_payment_method
             OR v_attempt.surcharge_cents <> v_surcharge
          THEN 'payment_method_changed'
        ELSE 'actor_changed'
      END;
      v_superseded_session := v_attempt.stripe_checkout_session_id;

      UPDATE invoice_payments
      SET status = 'failed',
          note = concat_ws(' ', note, CASE v_supersede_reason
            WHEN 'payment_method_changed'
              THEN 'Superseded because the payer changed payment method.'
            WHEN 'actor_changed'
              THEN 'Superseded because a different payer opened Checkout.'
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
        'invoice_link_id', v_attempt.invoice_link_id,
        'return_nonce', v_attempt.return_nonce,
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
    state, stripe_idempotency_key, payment_method, surcharge_cents,
    return_nonce
  ) VALUES (
    v_attempt_id, p_invoice_id, p_payer_id, p_stripe_customer_id,
    v_amount, lower(coalesce(v_invoice.currency, 'USD')),
    'claimed', 'invoice-checkout:' || v_attempt_id::text,
    p_payment_method, v_surcharge,
    encode(extensions.gen_random_bytes(32), 'hex')
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
    'invoice_link_id', v_attempt.invoice_link_id,
    'return_nonce', v_attempt.return_nonce,
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

COMMENT ON FUNCTION public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text) IS
  'Service-only Checkout claim for a signed-in payer. amount_cents is the authoritative invoice balance; surcharge_cents is the fee for the chosen rail (NULL method = legacy, no surcharge, both rails offered). A live attempt whose balance, currency, rail, fee, OR ACTOR (00574) no longer matches is superseded (failure_reason invoice_balance_changed | payment_method_changed | actor_changed) and its Stripe session id returned as superseded_session_id so the caller can expire it. Mints return_nonce for the /pay/return/<nonce> address.';

-- ── 6. claim_invoice_link_checkout_attempt — the sibling for the link rail ─
--
-- Grafted from 00428:190-397. Identity: the link is active and belongs to this
-- invoice, and p_stripe_customer_id matches invoice_links.stripe_customer_id.
-- Stamps invoice_link_id + return_nonce; payer_id stays NULL; the ledger is
-- indifferent (invoice_payments.recorded_by is nullable, 00178:137, and
-- apply_invoice_payment_effects reads neither column).

CREATE OR REPLACE FUNCTION public.claim_invoice_link_checkout_attempt(
  p_invoice_id uuid,
  p_invoice_link_id uuid,
  p_stripe_customer_id text,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice       invoices%ROWTYPE;
  v_link          invoice_links%ROWTYPE;
  v_amount        integer;
  v_attempt       invoice_checkout_attempts%ROWTYPE;
  v_payment       invoice_payments%ROWTYPE;
  v_attempt_id    uuid;
  v_card_bps      integer;
  v_surcharge     integer;
  v_supersede_reason text;
  v_superseded_session text;
  v_actor_changed boolean;
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

  -- The link IS the payer. Anything short of an active link on this exact
  -- invoice collapses to the same non-oracular error the page shows.
  SELECT * INTO v_link
  FROM invoice_links
  WHERE id = p_invoice_link_id
    AND invoice_id = p_invoice_id
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  IF p_stripe_customer_id IS NULL
     OR v_link.stripe_customer_id IS NULL
     OR v_link.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RAISE EXCEPTION 'invoice_checkout_customer_mismatch';
  END IF;

  IF v_invoice.status NOT IN ('sent','partially_paid') THEN
    RAISE EXCEPTION 'invoice_checkout_not_payable:%', v_invoice.status;
  END IF;
  v_amount := v_invoice.total_cents - v_invoice.amount_paid_cents;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invoice_checkout_nothing_due';
  END IF;

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
    -- A household attempt, a different link (post-Regenerate), or a different
    -- Stripe customer on the same link: supersede, never raise (M3).
    v_actor_changed :=
      v_attempt.payer_id IS NOT NULL
      OR v_attempt.invoice_link_id IS DISTINCT FROM p_invoice_link_id
      OR v_attempt.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id;

    -- Review F1: never supersede money in flight (see the household claim).
    IF v_attempt.state = 'processing' AND v_actor_changed THEN
      RAISE EXCEPTION 'invoice_checkout_in_progress';
    END IF;

    IF v_attempt.amount_cents <> v_amount
       OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
       OR v_attempt.payment_method IS DISTINCT FROM p_payment_method
       OR v_attempt.surcharge_cents <> v_surcharge
       OR v_actor_changed THEN
      v_supersede_reason := CASE
        WHEN v_attempt.amount_cents <> v_amount
             OR v_attempt.currency <> lower(coalesce(v_invoice.currency, 'USD'))
          THEN 'invoice_balance_changed'
        WHEN v_attempt.payment_method IS DISTINCT FROM p_payment_method
             OR v_attempt.surcharge_cents <> v_surcharge
          THEN 'payment_method_changed'
        ELSE 'actor_changed'
      END;
      v_superseded_session := v_attempt.stripe_checkout_session_id;

      UPDATE invoice_payments
      SET status = 'failed',
          note = concat_ws(' ', note, CASE v_supersede_reason
            WHEN 'payment_method_changed'
              THEN 'Superseded because the payer changed payment method.'
            WHEN 'actor_changed'
              THEN 'Superseded because a different payer opened Checkout.'
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
        INSERT INTO invoice_payments (
          invoice_id, amount_cents, surcharge_cents, method, status,
          stripe_checkout_session_id, recorded_by, checkout_attempt_id,
          note
        ) VALUES (
          v_attempt.invoice_id, v_attempt.amount_cents, v_attempt.surcharge_cents,
          'stripe', 'pending',
          v_attempt.stripe_checkout_session_id, NULL, v_attempt.id,
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
        'invoice_link_id', v_attempt.invoice_link_id,
        'return_nonce', v_attempt.return_nonce,
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
    id, invoice_id, payer_id, invoice_link_id, stripe_customer_id,
    amount_cents, currency, state, stripe_idempotency_key, payment_method,
    surcharge_cents, return_nonce
  ) VALUES (
    v_attempt_id, p_invoice_id, NULL, p_invoice_link_id, p_stripe_customer_id,
    v_amount, lower(coalesce(v_invoice.currency, 'USD')),
    'claimed', 'invoice-checkout:' || v_attempt_id::text,
    p_payment_method, v_surcharge,
    encode(extensions.gen_random_bytes(32), 'hex')
  ) RETURNING * INTO v_attempt;

  INSERT INTO invoice_payments (
    invoice_id, amount_cents, surcharge_cents, method, status, recorded_by,
    checkout_attempt_id, note
  ) VALUES (
    p_invoice_id, v_amount, v_surcharge, 'stripe', 'pending', NULL,
    v_attempt.id, 'Checkout attempt claimed through the invoice link before Stripe session creation.'
  ) RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'payment_id', v_payment.id,
    'invoice_id', v_attempt.invoice_id,
    'payer_id', v_attempt.payer_id,
    'invoice_link_id', v_attempt.invoice_link_id,
    'return_nonce', v_attempt.return_nonce,
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

COMMENT ON FUNCTION public.claim_invoice_link_checkout_attempt(uuid, uuid, text, text) IS
  'Service-only Checkout claim for a LINK payer (00574): the active link on this exact invoice plus its compare-and-set Stripe customer is the identity; payer_id stays NULL and recorded_by is NULL on the pending payment. Same balance/rail/fee/actor supersede machinery as claim_invoice_checkout_attempt.';

-- ── 7. finalize + recover — 00428 bodies + the link identity term (M4) ────

DROP FUNCTION IF EXISTS public.finalize_invoice_checkout_attempt(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.finalize_invoice_checkout_attempt(
  p_attempt_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text,
  p_invoice_link_id uuid DEFAULT NULL
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
     OR v_attempt.invoice_link_id IS DISTINCT FROM p_invoice_link_id
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
    'invoice_link_id', v_attempt.invoice_link_id,
    'return_nonce', v_attempt.return_nonce,
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

DROP FUNCTION IF EXISTS public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.recover_invoice_checkout_session_evidence(
  p_attempt_id uuid,
  p_payer_id uuid,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text,
  p_invoice_link_id uuid DEFAULT NULL
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
     OR v_attempt.invoice_link_id IS DISTINCT FROM p_invoice_link_id
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
    'invoice_link_id', v_attempt.invoice_link_id,
    'return_nonce', v_attempt.return_nonce,
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

COMMENT ON FUNCTION public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text, uuid) IS
  'Service-only signed-webhook recovery for an exact terminal Checkout attempt whose session pointer never finalized. Identity is payer OR link (00574) plus the Stripe customer. Stamps attempt/payment evidence atomically, leaves the attempt terminal, and never reopens the invoice pointer; a subsequent settlement is forced to requires_refund.';

-- ── 8. void → the link closes; money in flight blocks the void (M9 / M10) ─
--
-- The legacy body (00397:1271-1357, renamed at :1449) is where the attempt
-- logic lives; public.void_invoice is the authority wrapper and is untouched.
-- Body verbatim + two deltas: refuse while an attempt is processing (ACH money
-- in flight), and close the active link in the same block that closes the
-- local attempt. claimed / session_created do not block a void.

CREATE OR REPLACE FUNCTION public._void_invoice_authorized_legacy_00397(
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

  -- 00574 (M10): a bank transfer already in flight is real money; voiding
  -- underneath it would strand the payer on a dead link with a charge pending.
  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id AND state = 'processing'
  ) THEN
    RAISE EXCEPTION 'invoice_checkout_in_progress';
  END IF;

  -- Canonical billing lock order is invoice -> lines -> milestones. The latch
  -- synchronization trigger also takes line -> milestone, so lock every line
  -- deterministically before changing either lifecycle.
  PERFORM 1
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id
  ORDER BY id
  FOR UPDATE;

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
  --
  -- Review F9: the attempt is written BEFORE its payment. Failing the payment
  -- fires sync_invoice_checkout_attempt (00428), which marks the attempt
  -- failed with no reason; written first, failure_reason = 'invoice_voided'
  -- survives that trigger (it never touches the reason).
  UPDATE invoice_checkout_attempts
  SET state = 'failed', failure_reason = 'invoice_voided', finalized_at = now()
  WHERE invoice_id = p_invoice_id
    AND state IN ('claimed','session_created','processing');

  UPDATE invoice_payments
  SET status = 'failed',
      note = concat_ws(' ', note, 'Invoice voided before Checkout settled.')
  WHERE invoice_id = p_invoice_id
    AND status = 'pending'
    AND method = 'stripe';

  -- 00574 (M9 / K5): the link records the death. resolve_invoice_link renders
  -- the withdrawn sheet for a closed link — or the settling sheet while a
  -- late charge is still being sorted out — and never the payable page.
  UPDATE invoice_links
  SET status = 'closed', revoked_at = now()
  WHERE invoice_id = p_invoice_id
    AND status = 'active';

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public._void_invoice_authorized_legacy_00397(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 9. The link RPCs ──────────────────────────────────────────────────────

-- Producers (invoice-send, invoice-reminders, stripe-webhook, and the
-- signed-in create-checkout-session for its return nonce) call this: the
-- active row's token, minted on demand for an issued invoice that somehow has
-- none. NULL for draft / void / closed / missing. Never cache the result — a
-- Regenerate must be picked up by the next letter.
CREATE OR REPLACE FUNCTION public.ensure_invoice_link(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_designer uuid;
  v_token text;
BEGIN
  SELECT status, designer_id INTO v_status, v_designer
  FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('sent','partially_paid','paid') THEN
    RETURN NULL;
  END IF;

  SELECT token INTO v_token
  FROM invoice_links
  WHERE invoice_id = p_invoice_id AND status = 'active';
  IF FOUND THEN RETURN v_token; END IF;

  INSERT INTO invoice_links (invoice_id, token, created_by)
  VALUES (
    p_invoice_id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    (SELECT pr.id FROM profiles pr WHERE pr.id = v_designer)
  )
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING
  RETURNING token INTO v_token;
  IF v_token IS NULL THEN
    SELECT token INTO v_token
    FROM invoice_links WHERE invoice_id = p_invoice_id AND status = 'active';
  END IF;
  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.ensure_invoice_link(uuid) IS
  'Service-only: the active link token for an issued invoice, minted on demand. NULL for draft/void/closed/missing. Producers call this per letter and never cache it, so a Regenerate is honored by the next send.';

-- The only guest read path. One jsonb, no uuids, no PII beyond names. VOLATILE
-- (it writes view_count). Dead-link semantics (S2): malformed, unknown,
-- revoked, draft → the same NULL. A closed link, or a void invoice, renders
-- the withdrawn sheet (K5) — or the settling sheet when a Stripe payment is
-- still pending / requires_refund (M10) — with letterhead, number, title and a
-- contact, and nothing to pay.
CREATE OR REPLACE FUNCTION public.resolve_invoice_link(
  p_token text,
  p_record_view boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link           invoice_links%ROWTYPE;
  v_invoice        invoices%ROWTYPE;
  v_project_name   text;
  v_project_client uuid;
  v_payer          uuid;
  v_studio_name    text;
  v_studio_logo    text;
  v_studio_site    text;
  v_studio_source  text;
  v_studio_id      uuid;
  v_studio_location text;
  v_designer_name  text;
  v_client_name    text;
  v_bps            integer;
  v_remit          text;
  v_lines          jsonb;
  v_payments       jsonb;
  v_processing     boolean;
  v_in_flight      boolean;
  v_dead           boolean;
  v_kind           text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_link FROM invoice_links WHERE token = p_token;
  IF NOT FOUND OR v_link.status = 'revoked' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_link.invoice_id;
  IF NOT FOUND OR v_invoice.status = 'draft' THEN
    RETURN NULL;
  END IF;

  v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';
  IF NOT v_dead AND v_invoice.status NOT IN ('sent','partially_paid','paid') THEN
    RETURN NULL;
  END IF;

  IF p_record_view THEN
    UPDATE invoice_links
    SET view_count = view_count + 1, last_viewed_at = now()
    WHERE id = v_link.id;
  END IF;

  -- Studio-first letterhead: the invoice's own studio, then the project's,
  -- then the designer's primary — all three named (the two-studio fix).
  SELECT s.studio_id, s.name, s.logo_url, s.website, s.source
  INTO v_studio_id, v_studio_name, v_studio_logo, v_studio_site, v_studio_source
  FROM public.resolve_studio_identity(
    p_project_id  => v_invoice.project_id,
    p_designer_id => v_invoice.designer_id,
    p_studio_id   => v_invoice.studio_id
  ) AS s;

  -- "City, State" from the studio's address (organizations.address is the
  -- OrganizationAddress jsonb: street/city/state/zip/country). NULL when the
  -- studio has no address or the letterhead is not a studio org.
  IF v_studio_id IS NOT NULL THEN
    SELECT nullif(concat_ws(', ',
             nullif(btrim(o.address->>'city'), ''),
             nullif(btrim(o.address->>'state'), '')), '')
    INTO v_studio_location
    FROM organizations o WHERE o.id = v_studio_id;
  END IF;

  SELECT coalesce(
           nullif(btrim(pr.full_name), ''),
           nullif(btrim(pr.display_name), ''),
           nullif(btrim(pr.business_name), '')
         )
  INTO v_designer_name
  FROM profiles pr WHERE pr.id = v_invoice.designer_id;

  IF v_dead THEN
    v_in_flight := EXISTS (
      SELECT 1 FROM invoice_payments
      WHERE invoice_id = v_invoice.id
        AND method = 'stripe'
        AND status IN ('pending','requires_refund')
    );
    v_kind := CASE WHEN v_in_flight THEN 'settling' ELSE 'withdrawn' END;
    RETURN jsonb_build_object(
      'kind', v_kind,
      'sheet', v_kind,
      'invoice', jsonb_build_object(
        'number', v_invoice.invoice_number,
        'title', v_invoice.title
      ),
      'studio', jsonb_build_object(
        'name', v_studio_name, 'logo_url', v_studio_logo,
        'website', v_studio_site, 'source', v_studio_source,
        'location', v_studio_location
      ),
      'designer_display_name', v_designer_name,
      'contact', jsonb_build_object(
        'designer_display_name', v_designer_name,
        'studio_name', v_studio_name,
        'website', v_studio_site
      )
    );
  END IF;

  SELECT p.name, p.client_id INTO v_project_name, v_project_client
  FROM projects p WHERE p.id = v_invoice.project_id;
  v_payer := coalesce(v_invoice.client_id, v_project_client);

  IF v_payer IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.display_name), ''))
    INTO v_client_name
    FROM profiles pr WHERE pr.id = v_payer;
  END IF;
  IF v_client_name IS NULL THEN
    -- A rostered household with no profile: the name resolves only when the
    -- roster holds exactly one email-only row for this designer (M5's
    -- implementable form — designer_clients has no project_id to key on).
    SELECT min(dc.client_name) INTO v_client_name
    FROM designer_clients dc
    WHERE dc.designer_id = v_invoice.designer_id
      AND dc.client_id IS NULL
      AND nullif(btrim(dc.client_name), '') IS NOT NULL
    HAVING count(*) = 1;
  END IF;

  -- attribution: the maker / vendor a furnishings line came through — an
  -- explicit text on the line's metadata, else the FF&E item's vendor_name,
  -- else the vendor record's name. A name only: anything shaped like an id or
  -- an address is dropped rather than printed.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'description', li.description,
           'quantity', li.quantity,
           'unit_amount_cents', li.unit_amount_cents,
           'amount_cents', li.amount_cents,
           'kind', li.kind,
           'attribution', (
             SELECT CASE
               WHEN a.name IS NULL THEN NULL
               WHEN a.name ~ '@' THEN NULL
               WHEN a.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL
               ELSE a.name
             END
             FROM (SELECT coalesce(
                     nullif(btrim(li.metadata->>'attribution'), ''),
                     nullif(btrim(li.metadata->>'vendor_name'), ''),
                     nullif(btrim(f.vendor_name), ''),
                     nullif(btrim(v.name), '')
                   ) AS name) a
           )
         ) ORDER BY li.sort_order, li.created_at, li.id), '[]'::jsonb)
  INTO v_lines
  FROM invoice_line_items li
  LEFT JOIN project_ffe_items f ON f.id = li.ffe_item_id
  LEFT JOIN vendors v ON v.id = f.vendor_id
  WHERE li.invoice_id = v_invoice.id;

  -- Review F3: a pending row exists from the moment of claim — before any
  -- Stripe session, and for up to 24h after an abandoned card Checkout. Only a
  -- row with a stamped PaymentIntent is money in flight (an ACH debit
  -- initiated; 00428's sync trigger moves the attempt to processing on that
  -- stamp), so only those pending rows are listed or count as processing.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'amount_cents', p.amount_cents,
           'surcharge_cents', coalesce(p.surcharge_cents, 0),
           'method', p.method,
           'status', p.status,
           'rail', p.stripe_payment_method_type,
           'received_at', p.received_at
         ) ORDER BY coalesce(p.received_at, p.created_at), p.id), '[]'::jsonb),
         coalesce(bool_or(p.status = 'pending'), false)
  INTO v_payments, v_processing
  FROM invoice_payments p
  WHERE p.invoice_id = v_invoice.id
    AND p.status <> 'failed'
    AND NOT (p.status = 'pending' AND p.stripe_payment_intent_id IS NULL);

  SELECT sbs.card_surcharge_bps, sbs.check_remit_to INTO v_bps, v_remit
  FROM studio_billing_settings sbs
  WHERE sbs.studio_id = v_invoice.studio_id;

  RETURN jsonb_build_object(
    'kind', 'invoice',
    'sheet', 'invoice',
    'invoice', jsonb_build_object(
      'number', v_invoice.invoice_number,
      'title', v_invoice.title,
      'status', v_invoice.status,
      'issue_date', v_invoice.issue_date,
      'due_date', v_invoice.due_date,
      'paid_at', v_invoice.paid_at,
      'currency', coalesce(v_invoice.currency, 'USD'),
      'subtotal_cents', v_invoice.subtotal_cents,
      'tax_cents', v_invoice.tax_cents,
      'tax_rate', v_invoice.tax_rate,
      'total_cents', v_invoice.total_cents,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'balance_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
      'memo', v_invoice.memo,
      'project_name', v_project_name,
      'is_studio_invoice', v_invoice.project_id IS NULL
    ),
    'line_items', v_lines,
    'payments', v_payments,
    'studio', jsonb_build_object(
      'name', v_studio_name, 'logo_url', v_studio_logo,
      'website', v_studio_site, 'source', v_studio_source,
      'location', v_studio_location
    ),
    'designer_display_name', v_designer_name,
    'client_display_name', v_client_name,
    'payment_options', jsonb_build_object(
      -- ALWAYS the coalesced integer (G5): 300 is the rate the platform will
      -- charge, and most studios have no settings row.
      'card_surcharge_bps', coalesce(v_bps, 300),
      'check_remit_to', v_remit
    ),
    'pay', jsonb_build_object(
      'rails', jsonb_build_array('us_bank_account', 'card', 'check'),
      'processing', v_processing
    )
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_invoice_link(text, boolean) IS
  'The only guest read path for /pay/<token>. Called through the client portal''s service client (authenticated + service_role hold EXECUTE, anon never). Validates the 64-hex token, bumps view_count when p_record_view, and returns one narrow jsonb discriminated by kind (sheet is an alias for now): invoice (the payable sheet — no uuids, no emails, no internal notes, no Stripe ids, no token; studio.location is the studio address''s City, State; line_items[].attribution is the FF&E maker name), withdrawn (closed link / void invoice, K5), settling (closed with a PaymentIntent-stamped pending or a requires_refund payment, M10), or NULL for malformed/unknown/revoked/draft. pay.processing and payments[] count only PaymentIntent-stamped pending rows (F3).';

-- Ids only, for invoice-link-checkout. Rows only when the link is active, the
-- invoice is sent/partially_paid and the balance is positive.
DROP FUNCTION IF EXISTS public.resolve_invoice_link_for_checkout(text);

CREATE FUNCTION public.resolve_invoice_link_for_checkout(p_token text)
RETURNS TABLE (
  invoice_id uuid,
  link_id uuid,
  payer_id uuid,
  link_stripe_customer_id text,
  balance_cents integer,
  currency text,
  card_surcharge_bps integer,
  -- Review F14: the name the link Stripe customer is given — the household
  -- profile's, else the designer's single email-only roster row's (the same
  -- derivation resolve_invoice_link uses). Never an email.
  client_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id,
         l.id,
         coalesce(i.client_id, p.client_id),
         l.stripe_customer_id,
         (i.total_cents - i.amount_paid_cents)::integer,
         lower(coalesce(i.currency, 'USD')),
         coalesce(s.card_surcharge_bps, 300),
         coalesce(
           nullif(btrim(pr.full_name), ''),
           nullif(btrim(pr.display_name), ''),
           (SELECT min(dc.client_name)
            FROM public.designer_clients dc
            WHERE dc.designer_id = i.designer_id
              AND dc.client_id IS NULL
              AND nullif(btrim(dc.client_name), '') IS NOT NULL
            HAVING count(*) = 1)
         )
  FROM public.invoice_links l
  JOIN public.invoices i ON i.id = l.invoice_id
  LEFT JOIN public.projects p ON p.id = i.project_id
  LEFT JOIN public.studio_billing_settings s ON s.studio_id = i.studio_id
  LEFT JOIN public.profiles pr ON pr.id = coalesce(i.client_id, p.client_id)
  WHERE p_token IS NOT NULL
    AND p_token ~ '^[0-9a-f]{64}$'
    AND l.token = p_token
    AND l.status = 'active'
    AND i.status IN ('sent','partially_paid')
    AND i.total_cents - i.amount_paid_cents > 0;
$$;

COMMENT ON FUNCTION public.resolve_invoice_link_for_checkout(text) IS
  'Service-only: the ids invoice-link-checkout needs to open a Checkout for a link — invoice, link, the household payer if one exists (coalesce(invoices.client_id, projects.client_id); informational only — the guest rail always pays as the link, F5), the link''s own Stripe customer, the balance, the always-coalesced card bps, and the payer''s display name. Empty unless active + payable.';

-- The nonce on Stripe's return URL resolves to the link that was in force
-- when its attempt was claimed (review F2: a nonce in Stripe's retained logs
-- must never become an alias for a LATER token — Regenerate is the
-- designer's only revocation act). Active, or closed by a void (so a payer
-- returning after the void lands on the withdrawn/settling sheet); never a
-- revoked link and never one minted after the attempt.
CREATE OR REPLACE FUNCTION public.resolve_invoice_return_nonce(p_nonce text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.token
  FROM public.invoice_checkout_attempts a
  JOIN public.invoice_links l ON l.invoice_id = a.invoice_id
  WHERE p_nonce IS NOT NULL
    AND p_nonce ~ '^[0-9a-f]{64}$'
    AND a.return_nonce = p_nonce
    AND l.status <> 'revoked'
    AND l.created_at <= a.created_at
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_invoice_return_nonce(text) IS
  'Service-only: the link token behind a Checkout return nonce (/pay/return/<nonce> → /pay/<token>). NULL for malformed/unknown. Resolves only the link in force when the attempt was claimed (active or closed, never revoked, never a later mint) — a nonce is not an alias for a regenerated token (F2).';

-- Compare-and-set the link's Stripe customer, then return the canonical winner
-- (the ensureStripeCustomer race discipline).
CREATE OR REPLACE FUNCTION public.set_invoice_link_stripe_customer(
  p_link_id uuid,
  p_stripe_customer_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer text;
BEGIN
  IF p_stripe_customer_id IS NOT NULL AND btrim(p_stripe_customer_id) <> '' THEN
    UPDATE invoice_links
    SET stripe_customer_id = p_stripe_customer_id
    WHERE id = p_link_id
      AND stripe_customer_id IS NULL;
  END IF;
  SELECT stripe_customer_id INTO v_customer
  FROM invoice_links WHERE id = p_link_id;
  RETURN v_customer;
END;
$$;

-- M5: the address Checkout collected, so the receipt can reach the payer.
-- Idempotent; last non-empty write wins.
CREATE OR REPLACE FUNCTION public.set_invoice_link_payer_email(
  p_link_id uuid,
  p_email text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.invoice_links
  SET payer_email = nullif(btrim(p_email), '')
  WHERE id = p_link_id
    AND nullif(btrim(p_email), '') IS NOT NULL;
$$;

-- Regenerate: revoke the active link and mint a new one. Gated on
-- can_manage_invoice (the exact designer or an active non-guest peer in the
-- same design studio — contractor/manufacturer co-membership never grants
-- money authority, S5/S6). Refuses while an attempt is live (M11): the Stripe
-- success_url carries a nonce bound to the OLD attempt; the sweep clears
-- abandonment within 24h.
CREATE OR REPLACE FUNCTION public.regenerate_invoice_link(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_token text;
BEGIN
  IF NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT status INTO v_status FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  IF v_status NOT IN ('sent','partially_paid','paid') THEN
    RAISE EXCEPTION 'invoice_link_not_payable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id
      AND state IN ('claimed','session_created','processing')
  ) THEN
    RAISE EXCEPTION 'invoice_checkout_in_progress';
  END IF;

  UPDATE invoice_links
  SET status = 'revoked', revoked_at = now()
  WHERE invoice_id = p_invoice_id AND status = 'active';

  INSERT INTO invoice_links (invoice_id, token, created_by)
  VALUES (
    p_invoice_id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    (SELECT pr.id FROM profiles pr WHERE pr.id = auth.uid())
  )
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.regenerate_invoice_link(uuid) IS
  'Authenticated (can_manage_invoice): revokes the invoice''s active link and mints a fresh token. Raises invoice_not_found on every authority failure, invoice_link_not_payable for a draft/void, and invoice_checkout_in_progress while an attempt is claimed/session_created/processing (M11).';

-- Folio + iOS read: {token, status} for the invoice's current link. Gate (S5):
-- can_manage_invoice OR the household payer — NOT get_invoice_payment_options'
-- looser studio-member predicate. Never returns a revoked token.
CREATE OR REPLACE FUNCTION public.get_invoice_link(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_project_client uuid;
  v_can_manage boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT client_id INTO v_project_client
  FROM projects WHERE id = v_invoice.project_id;

  v_can_manage := public.can_manage_invoice(p_invoice_id);
  IF NOT (
    v_can_manage
    OR (auth.uid() IS NOT NULL
        AND auth.uid() = coalesce(v_invoice.client_id, v_project_client))
  ) THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  -- The household never learns a draft exists.
  IF v_invoice.status = 'draft' AND NOT v_can_manage THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT jsonb_build_object('token', l.token, 'status', l.status)
  INTO v_result
  FROM invoice_links l
  WHERE l.invoice_id = p_invoice_id
    AND l.status <> 'revoked'
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_invoice_link(uuid) IS
  'Authenticated: {token, status} for an invoice''s current link (active, else closed), or NULL when none exists (a draft). Readable by can_manage_invoice or the household payer only; every denial raises invoice_not_found.';

-- ── 10. The sweep — abandoned Checkouts expire within 24h (M3) ────────────
--
-- groom_agent_tasks' shape (00300): advisory xact lock → a skipped job_runs
-- row on contention; app.actor; a running row; the work; succeeded/failed.
-- The work: claimed / session_created attempts older than p_stale flip to
-- expired, their pending invoice_payments rows fail, and invoices.stripe_
-- checkout_session_id is cleared where it points at them. processing is
-- NEVER swept — that is ACH money in flight. Lock order is invoice → attempt,
-- as fail_invoice_checkout_attempt takes it.

CREATE OR REPLACE FUNCTION public.expire_stale_invoice_checkout_attempts(
  p_stale interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id           bigint;
  v_expired          int := 0;
  v_payments_failed  int := 0;
  v_pointers_cleared int := 0;
  v_count            int;
  v_candidate        record;
  v_attempt          public.invoice_checkout_attempts%ROWTYPE;
  v_detail           jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:invoice-checkout-attempts-expire')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('invoice-checkout-attempts-expire', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:invoice-checkout-attempts-expire', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('invoice-checkout-attempts-expire', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    FOR v_candidate IN
      SELECT a.id, a.invoice_id
      FROM public.invoice_checkout_attempts a
      WHERE a.state IN ('claimed','session_created')
        AND a.created_at < now() - p_stale
      ORDER BY a.created_at
    LOOP
      -- Re-judge under the invoice lock: a claim may have advanced or
      -- superseded the attempt since the candidate list was read.
      PERFORM 1 FROM public.invoices WHERE id = v_candidate.invoice_id FOR UPDATE;
      SELECT * INTO v_attempt
      FROM public.invoice_checkout_attempts
      WHERE id = v_candidate.id
      FOR UPDATE;
      CONTINUE WHEN NOT FOUND
        OR v_attempt.state NOT IN ('claimed','session_created')
        OR v_attempt.created_at >= now() - p_stale;

      -- Payment first, attempt second — fail_invoice_checkout_attempt's
      -- order: the 00397 sync trigger marks the attempt failed when its
      -- payment fails, and the unconditional write below then names the
      -- real reason.
      UPDATE public.invoice_payments
      SET status = 'failed',
          note = concat_ws(' ', note, 'Expired: Checkout was abandoned.')
      WHERE checkout_attempt_id = v_attempt.id
        AND status = 'pending';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_payments_failed := v_payments_failed + v_count;

      UPDATE public.invoice_checkout_attempts
      SET state = 'expired', failure_reason = 'stale_checkout_attempt',
          finalized_at = coalesce(finalized_at, now())
      WHERE id = v_attempt.id;
      v_expired := v_expired + 1;

      UPDATE public.invoices
      SET stripe_checkout_session_id = NULL, updated_at = now()
      WHERE id = v_attempt.invoice_id
        AND v_attempt.stripe_checkout_session_id IS NOT NULL
        AND stripe_checkout_session_id = v_attempt.stripe_checkout_session_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_pointers_cleared := v_pointers_cleared + v_count;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (00300 idiom): the failed row must persist as the
    -- authoritative failure record; the guarded block's changes roll back to
    -- its savepoint and every pass is idempotent.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object(
             'expired', v_expired,
             'payments_failed', v_payments_failed,
             'pointers_cleared', v_pointers_cleared
           )
     WHERE id = v_run_id;
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'expired', v_expired,
      'payments_failed', v_payments_failed,
      'pointers_cleared', v_pointers_cleared
    );
  END;

  v_detail := jsonb_build_object(
    'expired', v_expired,
    'payments_failed', v_payments_failed,
    'pointers_cleared', v_pointers_cleared
  );

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_invoice_checkout_attempts(interval) IS
  'Hourly pg_cron sweep (00574, M3): claimed/session_created Checkout attempts older than p_stale (24h) become expired, their pending payment rows fail, and the invoice''s session pointer is cleared. processing attempts (ACH in flight) are never swept. One job_runs row per invocation.';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-checkout-attempts-expire') THEN
    PERFORM cron.unschedule('invoice-checkout-attempts-expire');
  END IF;
END $$;

SELECT cron.schedule(
  'invoice-checkout-attempts-expire',
  '17 * * * *',
  $$SELECT public.expire_stale_invoice_checkout_attempts();$$
);

-- Registry comment carried forward from 00572 and extended. undefined_object
-- joins insufficient_privilege: the comment is documentation and a stack
-- without pg_cron must not fail the migration over a sentence.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. The Invoice, Standing Alone (00574): invoice-checkout-attempts-expire at 17 past every hour -> public.expire_stale_invoice_checkout_attempts(), expiring claimed/session_created Checkout attempts older than 24h (never processing), history in job_runs. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ── 11. Grants — batched (00437:515-528 idiom). anon holds EXECUTE on NONE ──
--
-- Strata predates the 2026-05-30 grant-default flip and auto-grants anon
-- EXECUTE at creation, so every function here is revoked from PUBLIC/anon
-- explicitly before its narrow grant. Adds GRANT/REVOKE → regenerate
-- supabase/seed/00-legacy-grants.sql (python3 scripts/generate-legacy-grants.py).

REVOKE ALL ON FUNCTION
  public.mint_invoice_link_on_issue(),
  public.ensure_invoice_link(uuid),
  public.resolve_invoice_link(text, boolean),
  public.resolve_invoice_link_for_checkout(text),
  public.resolve_invoice_return_nonce(text),
  public.set_invoice_link_stripe_customer(uuid, text),
  public.set_invoice_link_payer_email(uuid, text),
  public.claim_invoice_link_checkout_attempt(uuid, uuid, text, text),
  public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text),
  public.finalize_invoice_checkout_attempt(uuid, uuid, text, text, uuid),
  public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text, uuid),
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid),
  public.expire_stale_invoice_checkout_attempts(interval)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.ensure_invoice_link(uuid),
  public.resolve_invoice_link(text, boolean),
  public.resolve_invoice_link_for_checkout(text),
  public.resolve_invoice_return_nonce(text),
  public.set_invoice_link_stripe_customer(uuid, text),
  public.set_invoice_link_payer_email(uuid, text),
  public.claim_invoice_link_checkout_attempt(uuid, uuid, text, text),
  public.claim_invoice_checkout_attempt(uuid, uuid, text, boolean, text),
  public.finalize_invoice_checkout_attempt(uuid, uuid, text, text, uuid),
  public.recover_invoice_checkout_session_evidence(uuid, uuid, text, text, uuid),
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid),
  public.expire_stale_invoice_checkout_attempts(interval)
TO service_role;

-- resolve_invoice_link mirrors resolve_plan_transmittal (00429:1908-1911):
-- authenticated + service_role, never anon — it is called only from the
-- client portal's service client. The two folio RPCs are browser-callable.
GRANT EXECUTE ON FUNCTION
  public.resolve_invoice_link(text, boolean),
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid)
TO authenticated;
