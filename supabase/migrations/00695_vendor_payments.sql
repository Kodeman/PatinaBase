-- ═══════════════════════════════════════════════════════════════════════════
-- 00695 — Record what we paid: vendor_payments, studio_payment_methods, and
--         po_payments behind RPCs (C-11)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-401). direction §7 C-11, d2 §1 C5 and §M5, d3 §4.5.
--
-- Before this, po_payments (00148) was FOR ALL to any studio co-member
-- (00584:244-259, plus 00148's owner FOR ALL policy), and useLogPaymentPaid
-- wrote `state='paid'` straight from the browser — onto any row, including
-- the Stripe catalog rail's (00275:39-41). A member could mark a Stripe-owned
-- payable paid without Stripe, and nothing recorded what was actually paid.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- studio_payment_methods  the studio's cards/accounts ("Amex · Leah"). last4
--                         only, never a full number: last4 must be exactly four
--                         digits and the label refuses a 9+ digit run.
--                         Read: active non-guest members of the organization
--                         (is_active_org_member). Writes: upsert RPC only.
-- vendor_payments         append-only ledger of money paid to makers. Partial
--                         payments, and payments tied to no scheduled row
--                         (po_payment_id NULL, e.g. a restocking fee). A
--                         mistake is voided with a reason, never edited or
--                         deleted (guard trigger, every role). Read: studio
--                         co-members of the PO owner, the same predicate as
--                         po_payments. Writes: RPCs only.
--                         organization_id is projects.studio_id, else the
--                         chosen payment method's studio, else NULL (a PO
--                         carries no organization; access follows the PO).
--
-- ── RPCs (SECURITY DEFINER, pinned search_path, PUBLIC/anon revoked) ───────
-- Access to a PO's money uses can_send_purchase_order (00690): the project
-- owner, an active non-guest member of projects.studio_id when set, else a
-- non-guest co-member of the owner (is_studio_comember). Guests and
-- outsiders are refused.
--   record_vendor_payment(p_po_id, p_request)   lane-guarded: refuses a PO
--       with is_patina_catalog, and a po_payments row carrying a Stripe
--       session or intent id. Those settle only through Stripe.
--   void_vendor_payment(p_payment_id, p_reason)
--   update_po_payment_schedule(p_po_id, p_request)  amount / due date / label
--       of scheduled rows, allowed only until the first (non-void) payment is
--       recorded; after that, changes are a change order (M7).
--   upsert_studio_payment_method(p_request)
--
-- ── DERIVED STATE ───────────────────────────────────────────────────────────
-- po_payments.state and paid_date follow the sum of the row's non-void
-- vendor_payments (AFTER trigger on vendor_payments):
--   sum >= amount_cents (and > 0)  → state 'paid', paid_date = latest paid_on
--   otherwise, a row that was paid → 'pending' if due_date is still ahead
--                                    (the 00189 cron flips it on the day),
--                                    else 'due'
-- The flip to 'paid' is a plain UPDATE OF state, so 00184's
-- trg_deposit_paid_flips_balance still fires and the balance goes due on a
-- shipped split-pattern PO, and 00151's due notification fires on a revert to
-- 'due'. Rows with a Stripe session or intent id are never derived: the
-- webhook owns them.
--
-- Legacy: any studio-lane row already 'paid' without a ledger entry gets one
-- synthetic vendor_payments row (method 'other', recorded_by NULL), so the
-- derivation agrees with the stored state instead of un-paying it on the next
-- record or void. (useLogPaymentPaid had no app caller, so this is expected to
-- be empty on Strata.)
--
-- ── THE BACK DOOR CLOSES ────────────────────────────────────────────────────
-- Both FOR ALL policies on po_payments are dropped and replaced by one
-- SELECT-only co-member policy (same predicate as 00584). INSERT, UPDATE,
-- DELETE and TRUNCATE are revoked from authenticated (and everything from
-- anon). Every remaining writer is unaffected:
--   - stripe-webhook, create-checkout-session, expire-po-session: service_role
--     (keeps ALL; RLS bypassed);
--   - create_purchase_order, flip_pending_balance_to_due,
--     receiving_inspection_side_effects, reprice_replacement_purchase_order,
--     advance_purchase_order_status, deposit_paid_flips_balance and the
--     po-payments-due-daily cron: SECURITY DEFINER / postgres.
-- useLogPaymentPaid is repointed to record_vendor_payment in the same change.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. studio_payment_methods ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.studio_payment_methods (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label            text        NOT NULL,
  kind             text        NOT NULL,
  last4            text,
  holder_member_id uuid        REFERENCES public.organization_members(id) ON DELETE SET NULL,
  archived_at      timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_payment_methods_label_ck
    CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  -- A card or account number typed into the label is refused, not stored.
  CONSTRAINT studio_payment_methods_label_no_number_ck
    CHECK (label !~ '[0-9]([ -]?[0-9]){8,}'),
  CONSTRAINT studio_payment_methods_kind_ck
    CHECK (kind IN ('card', 'ach', 'check', 'wire', 'cash', 'other')),
  CONSTRAINT studio_payment_methods_last4_ck
    CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$')
);

CREATE INDEX IF NOT EXISTS idx_studio_payment_methods_org_live
  ON public.studio_payment_methods (organization_id)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_studio_payment_methods ON public.studio_payment_methods;
CREATE TRIGGER set_updated_at_studio_payment_methods
  BEFORE UPDATE ON public.studio_payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.studio_payment_methods IS
  'A studio''s payment instruments (00695, C-11): label, kind, last4 only (never a full '
  'number). Read by active non-guest members of the organization; written only through '
  'upsert_studio_payment_method. Archived, never deleted, once a payment names it.';

ALTER TABLE public.studio_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_payment_methods_member_select ON public.studio_payment_methods;
CREATE POLICY studio_payment_methods_member_select ON public.studio_payment_methods
  FOR SELECT TO authenticated
  USING (public.is_active_org_member(organization_id));

REVOKE ALL ON TABLE public.studio_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_payment_methods TO service_role;

-- ─── 2. vendor_payments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_payments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        REFERENCES public.organizations(id),
  -- No cascade: a purchase order with recorded payments cannot be deleted.
  purchase_order_id     uuid        NOT NULL REFERENCES public.purchase_orders(id),
  -- SET NULL: a schedule rebuilt by reprice_replacement_purchase_order (00456)
  -- leaves the payment on the PO, unscheduled, instead of losing it.
  po_payment_id         uuid        REFERENCES public.po_payments(id) ON DELETE SET NULL,
  paid_on               date        NOT NULL,
  amount_cents          integer     NOT NULL,
  currency_code         text        NOT NULL DEFAULT 'USD',
  method                text        NOT NULL,
  payment_method_id     uuid        REFERENCES public.studio_payment_methods(id),
  reference             text,
  receipt_document_path text,
  recorded_by           uuid,
  voided_at             timestamptz,
  void_reason           text,
  voided_by             uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payments_amount_ck CHECK (amount_cents > 0),
  CONSTRAINT vendor_payments_currency_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT vendor_payments_method_ck
    CHECK (method IN ('card', 'ach', 'check', 'wire', 'cash', 'other')),
  CONSTRAINT vendor_payments_reference_ck
    CHECK (reference IS NULL OR length(reference) <= 200),
  CONSTRAINT vendor_payments_receipt_ck
    CHECK (receipt_document_path IS NULL OR length(receipt_document_path) <= 1024),
  CONSTRAINT vendor_payments_void_ck
    CHECK ((voided_at IS NULL) = (void_reason IS NULL)
           AND (void_reason IS NULL OR length(btrim(void_reason)) BETWEEN 1 AND 500))
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_po
  ON public.vendor_payments (purchase_order_id, paid_on);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_po_payment_live
  ON public.vendor_payments (po_payment_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_payments_org_paid_on
  ON public.vendor_payments (organization_id, paid_on);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_payment_method
  ON public.vendor_payments (payment_method_id)
  WHERE payment_method_id IS NOT NULL;

COMMENT ON TABLE public.vendor_payments IS
  'Append-only ledger of money a studio paid a maker (00695, C-11). Optional link to a '
  'po_payments schedule row (NULL = unscheduled). Voided with a reason, never edited or '
  'deleted. po_payments.state / paid_date are derived from the non-void sum. Written only '
  'through record_vendor_payment / void_vendor_payment.';

-- Append-only, for every role. Two updates are legal: a one-time void (only
-- the void columns change), and the po_payment_id FK's ON DELETE SET NULL.
CREATE OR REPLACE FUNCTION public.vendor_payments_guard_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vendor_payments is append-only: void a payment with void_vendor_payment, never delete it'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD.po_payment_id IS NOT NULL AND NEW.po_payment_id IS NULL
     AND (to_jsonb(NEW) - 'po_payment_id') = (to_jsonb(OLD) - 'po_payment_id') THEN
    RETURN NEW;
  END IF;

  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['voided_at', 'void_reason', 'voided_by'])
       = (to_jsonb(OLD) - ARRAY['voided_at', 'void_reason', 'voided_by']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'vendor_payments is append-only: a payment can only be voided once, with a reason'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_payments_guard_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vendor_payments_guard_append_only ON public.vendor_payments;
CREATE TRIGGER trg_vendor_payments_guard_append_only
  BEFORE UPDATE OR DELETE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payments_guard_append_only();

-- Derive po_payments.state / paid_date from the non-void ledger sum.
CREATE OR REPLACE FUNCTION public.vendor_payments_derive_po_payment_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id   uuid;
  v_row  public.po_payments%ROWTYPE;
  v_sum  bigint;
  v_last date;
BEGIN
  FOREACH v_id IN ARRAY ARRAY[
    NEW.po_payment_id,
    CASE WHEN TG_OP = 'UPDATE' AND OLD.po_payment_id IS DISTINCT FROM NEW.po_payment_id
         THEN OLD.po_payment_id END
  ] LOOP
    CONTINUE WHEN v_id IS NULL;

    SELECT * INTO v_row FROM public.po_payments WHERE id = v_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    -- The Stripe lane is never derived: stripe-webhook owns those rows.
    CONTINUE WHEN v_row.stripe_checkout_session_id IS NOT NULL
               OR v_row.stripe_payment_intent_id IS NOT NULL;

    SELECT COALESCE(sum(amount_cents), 0), max(paid_on)
      INTO v_sum, v_last
      FROM public.vendor_payments
     WHERE po_payment_id = v_id
       AND voided_at IS NULL;

    IF v_sum > 0 AND v_sum >= v_row.amount_cents THEN
      IF v_row.state IS DISTINCT FROM 'paid' OR v_row.paid_date IS DISTINCT FROM v_last THEN
        -- UPDATE OF state: 00184's trg_deposit_paid_flips_balance fires here.
        UPDATE public.po_payments
           SET state = 'paid', paid_date = v_last
         WHERE id = v_id;
      END IF;
    ELSIF v_row.state = 'paid' THEN
      UPDATE public.po_payments
         SET state = CASE WHEN v_row.due_date IS NOT NULL AND v_row.due_date > CURRENT_DATE
                          THEN 'pending' ELSE 'due' END::public.po_payment_state,
             paid_date = NULL
       WHERE id = v_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_payments_derive_po_payment_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vendor_payments_derive_po_payment_state ON public.vendor_payments;
CREATE TRIGGER trg_vendor_payments_derive_po_payment_state
  AFTER INSERT OR UPDATE OF voided_at, po_payment_id ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payments_derive_po_payment_state();

ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_payments_studio_select ON public.vendor_payments;
CREATE POLICY vendor_payments_studio_select ON public.vendor_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = vendor_payments.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

REVOKE ALL ON TABLE public.vendor_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vendor_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vendor_payments TO service_role;

-- Legacy studio-lane rows already marked paid get their one ledger entry.
INSERT INTO public.vendor_payments (
  organization_id, purchase_order_id, po_payment_id, paid_on, amount_cents,
  method, reference, recorded_by, created_at
)
SELECT
  project.studio_id, pp.purchase_order_id, pp.id, pp.paid_date, pp.amount_cents,
  'other', 'Marked paid before the payment ledger (00695)', NULL, COALESCE(pp.updated_at, now())
FROM public.po_payments pp
JOIN public.purchase_orders po ON po.id = pp.purchase_order_id
LEFT JOIN public.projects project ON project.id = po.project_id
WHERE pp.state = 'paid'
  AND pp.paid_date IS NOT NULL
  AND pp.amount_cents > 0
  AND NOT po.is_patina_catalog
  AND pp.stripe_checkout_session_id IS NULL
  AND pp.stripe_payment_intent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.vendor_payments vp WHERE vp.po_payment_id = pp.id);

-- ─── 3. po_payments: SELECT-only for the browser ────────────────────────────

DROP POLICY IF EXISTS po_payments_studio_rw ON public.po_payments;
DROP POLICY IF EXISTS "Designers manage payments on their purchase orders" ON public.po_payments;
DROP POLICY IF EXISTS po_payments_studio_select ON public.po_payments;
CREATE POLICY po_payments_studio_select ON public.po_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_payments.purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

REVOKE ALL ON TABLE public.po_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_payments TO authenticated;
GRANT ALL ON TABLE public.po_payments TO service_role;

-- ─── 4. upsert_studio_payment_method ────────────────────────────────────────
-- p_request: { id?, organizationId?, label, kind, last4?, holderMemberId?,
--              archived? }. Without id it inserts; organizationId defaults to
-- the caller's only active non-guest studio. With id it updates the keys
-- present. archived: true archives (kept for the payments that name it),
-- false restores.

CREATE OR REPLACE FUNCTION public.upsert_studio_payment_method(p_request jsonb)
RETURNS public.studio_payment_methods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    jsonb := COALESCE(p_request, '{}'::jsonb);
  v_id     uuid;
  v_row    public.studio_payment_methods%ROWTYPE;
  v_org    uuid;
  v_label  text;
  v_kind   text;
  v_last4  text;
  v_holder uuid;
  v_arch   timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - ARRAY['id', 'organizationId', 'label', 'kind', 'last4', 'holderMemberId', 'archived'])
     <> '{}'::jsonb THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - ARRAY['id', 'organizationId', 'label', 'kind', 'last4', 'holderMemberId', 'archived']) k)
      USING ERRCODE = 'check_violation';
  END IF;

  v_id := NULLIF(v_req->>'id', '')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.studio_payment_methods WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_active_org_member(v_row.organization_id) THEN
      RAISE EXCEPTION 'upsert_studio_payment_method: payment method % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_req ? 'organizationId'
       AND NULLIF(v_req->>'organizationId', '')::uuid IS DISTINCT FROM v_row.organization_id THEN
      RAISE EXCEPTION 'upsert_studio_payment_method: a payment method cannot move to another studio'
        USING ERRCODE = 'check_violation';
    END IF;
    v_org := v_row.organization_id;
  ELSE
    v_org := NULLIF(v_req->>'organizationId', '')::uuid;
    IF v_org IS NULL THEN
      SELECT CASE WHEN count(DISTINCT organization_id) = 1
                  THEN (array_agg(organization_id))[1] END
        INTO v_org
        FROM public.organization_members
       WHERE user_id = v_uid AND status = 'active' AND role <> 'guest';
      IF v_org IS NULL THEN
        RAISE EXCEPTION 'upsert_studio_payment_method: organizationId is required (the caller is not in exactly one studio)'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NOT public.is_active_org_member(v_org) THEN
      RAISE EXCEPTION 'upsert_studio_payment_method: studio % not found or access denied', v_org
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_label  := CASE WHEN v_req ? 'label' THEN NULLIF(btrim(v_req->>'label'), '') ELSE v_row.label END;
  v_kind   := CASE WHEN v_req ? 'kind' THEN NULLIF(btrim(v_req->>'kind'), '') ELSE v_row.kind END;
  v_last4  := CASE WHEN v_req ? 'last4' THEN NULLIF(btrim(v_req->>'last4'), '') ELSE v_row.last4 END;
  v_holder := CASE WHEN v_req ? 'holderMemberId' THEN NULLIF(v_req->>'holderMemberId', '')::uuid
                   ELSE v_row.holder_member_id END;
  v_arch   := v_row.archived_at;
  IF v_req ? 'archived' THEN
    IF jsonb_typeof(v_req->'archived') <> 'boolean' THEN
      RAISE EXCEPTION 'upsert_studio_payment_method: archived must be true or false'
        USING ERRCODE = 'check_violation';
    END IF;
    v_arch := CASE WHEN (v_req->'archived') = 'true'::jsonb THEN COALESCE(v_row.archived_at, now()) END;
  END IF;

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: a label is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: kind must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_last4 IS NOT NULL AND v_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: last4 must be exactly four digits; never send a full number'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_holder IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = v_holder AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'upsert_studio_payment_method: holder % is not a member of this studio', v_holder
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.studio_payment_methods (
      organization_id, label, kind, last4, holder_member_id, archived_at, created_by
    )
    VALUES (v_org, v_label, v_kind, v_last4, v_holder, v_arch, v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.studio_payment_methods
       SET label = v_label, kind = v_kind, last4 = v_last4,
           holder_member_id = v_holder, archived_at = v_arch
     WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_studio_payment_method(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_studio_payment_method(jsonb) TO authenticated;

-- ─── 5. record_vendor_payment ───────────────────────────────────────────────
-- p_request: { poPaymentId?, amountCents?, paidOn?, method?, paymentMethodId?,
--              reference?, receiptDocumentPath?, currencyCode? }
--   poPaymentId    the scheduled row paid toward (must be on p_po_id). Omit for
--                  an unscheduled payment.
--   amountCents    positive whole cents. Omitted with poPaymentId = the row's
--                  unpaid remainder. Overpayment is recorded, never blocked (R9).
--   paidOn         date; defaults to the UTC day; at most one day ahead.
--   method         card|ach|check|wire|cash|other; defaults to the payment
--                  method's kind, else 'other'.
-- Returns the new vendor_payments row. The derived po_payments state is read
-- back through usePOPayments.

CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_po_id uuid, p_request jsonb)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_req       jsonb := COALESCE(p_request, '{}'::jsonb);
  v_allowed   text[] := ARRAY['poPaymentId', 'amountCents', 'paidOn', 'method', 'paymentMethodId',
                              'reference', 'receiptDocumentPath', 'currencyCode'];
  v_utc_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_po        public.purchase_orders%ROWTYPE;
  v_studio    uuid;
  v_sched     public.po_payments%ROWTYPE;
  v_sched_id  uuid;
  v_amount    numeric;
  v_paid      bigint;
  v_paid_on   date;
  v_pm        public.studio_payment_methods%ROWTYPE;
  v_pm_id     uuid;
  v_method    text;
  v_row       public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_payment: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_payment: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_allowed) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_payment: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - v_allowed) k)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lane guard, PO level.
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % is on the Patina catalog lane; it settles through Stripe only', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_sched_id := NULLIF(v_req->>'poPaymentId', '')::uuid;
  IF v_sched_id IS NOT NULL THEN
    SELECT * INTO v_sched FROM public.po_payments
     WHERE id = v_sched_id AND purchase_order_id = p_po_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is not on purchase order %', v_sched_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- Lane guard, row level.
    IF v_sched.stripe_checkout_session_id IS NOT NULL OR v_sched.stripe_payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is on the Stripe rail; it settles through Stripe only', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_req ? 'amountCents' THEN
    IF jsonb_typeof(v_req->'amountCents') <> 'number' THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
    v_amount := (v_req->>'amountCents')::numeric;
    IF v_amount <= 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a positive whole number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_sched_id IS NOT NULL THEN
    SELECT COALESCE(sum(amount_cents), 0) INTO v_paid
      FROM public.vendor_payments
     WHERE po_payment_id = v_sched_id AND voided_at IS NULL;
    v_amount := v_sched.amount_cents - v_paid;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is already paid in full; pass amountCents to record more', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'record_vendor_payment: amountCents is required for a payment not tied to a scheduled row'
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid_on := COALESCE(NULLIF(v_req->>'paidOn', '')::date, v_utc_day);
  IF v_paid_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_vendor_payment: paidOn % is in the future', v_paid_on
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_po.project_id;

  v_pm_id := NULLIF(v_req->>'paymentMethodId', '')::uuid;
  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_studio IS NOT NULL AND v_pm.organization_id <> v_studio THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_method := COALESCE(NULLIF(btrim(v_req->>'method'), ''), v_pm.kind, 'other');
  IF v_method NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_vendor_payment: method must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_payments (
    organization_id, purchase_order_id, po_payment_id, paid_on, amount_cents,
    currency_code, method, payment_method_id, reference, receipt_document_path, recorded_by
  )
  VALUES (
    COALESCE(v_studio, v_pm.organization_id), p_po_id, v_sched_id, v_paid_on, v_amount::integer,
    upper(COALESCE(NULLIF(btrim(v_req->>'currencyCode'), ''), 'USD')), v_method, v_pm_id,
    NULLIF(btrim(v_req->>'reference'), ''), NULLIF(btrim(v_req->>'receiptDocumentPath'), ''), v_uid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vendor_payment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid, jsonb) TO authenticated;

-- ─── 6. void_vendor_payment ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_vendor_payment(p_payment_id uuid, p_reason text)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_po_id  uuid;
  v_row    public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT purchase_order_id INTO v_po_id FROM public.vendor_payments WHERE id = p_payment_id;
  IF NOT FOUND OR NOT public.can_send_purchase_order(v_po_id) THEN
    RAISE EXCEPTION 'void_vendor_payment: payment % not found or access denied', p_payment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: a reason is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'void_vendor_payment: the reason is longer than 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same lock order as record_vendor_payment: the PO, then the ledger row.
  PERFORM 1 FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
  SELECT * INTO v_row FROM public.vendor_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: payment % is already void', p_payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.vendor_payments
     SET voided_at = now(), void_reason = v_reason, voided_by = v_uid
   WHERE id = p_payment_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.void_vendor_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_vendor_payment(uuid, text) TO authenticated;

-- ─── 7. update_po_payment_schedule ──────────────────────────────────────────
-- p_request: { payments: [ { id, amountCents?, dueDate?, label? } ] }
-- Edits the PO's scheduled rows (keys present only; dueDate / label may be
-- null to clear). Refused once any non-void payment is recorded on the PO,
-- on the catalog lane, and on any row that is paid or carries a Stripe id.
-- Returns the PO's schedule after the edit.

CREATE OR REPLACE FUNCTION public.update_po_payment_schedule(p_po_id uuid, p_request jsonb)
RETURNS SETOF public.po_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_po      public.purchase_orders%ROWTYPE;
  v_entry   jsonb;
  v_id      uuid;
  v_sched   public.po_payments%ROWTYPE;
  v_amount  numeric;
  v_label   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'update_po_payment_schedule: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' OR (v_req - 'payments') <> '{}'::jsonb
     OR jsonb_typeof(v_req->'payments') <> 'array'
     OR jsonb_array_length(v_req->'payments') = 0 THEN
    RAISE EXCEPTION 'update_po_payment_schedule: request must be { payments: [ … ] } with at least one row'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'update_po_payment_schedule: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'update_po_payment_schedule: purchase order % is on the Patina catalog lane; its schedule follows Stripe', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vendor_payments
    WHERE purchase_order_id = p_po_id AND voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'update_po_payment_schedule: a payment is already recorded on purchase order %; the schedule changes through a change order', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_req->'payments') LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR (v_entry - ARRAY['id', 'amountCents', 'dueDate', 'label']) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'update_po_payment_schedule: each row is { id, amountCents?, dueDate?, label? }'
        USING ERRCODE = 'check_violation';
    END IF;
    v_id := NULLIF(v_entry->>'id', '')::uuid;
    SELECT * INTO v_sched FROM public.po_payments
     WHERE id = v_id AND purchase_order_id = p_po_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is not on purchase order %', v_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_sched.stripe_checkout_session_id IS NOT NULL OR v_sched.stripe_payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is on the Stripe rail', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_sched.state IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is already %', v_id, v_sched.state
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry ? 'amountCents' THEN
      IF jsonb_typeof(v_entry->'amountCents') <> 'number' THEN
        RAISE EXCEPTION 'update_po_payment_schedule: amountCents must be a number of cents'
          USING ERRCODE = 'check_violation';
      END IF;
      v_amount := (v_entry->>'amountCents')::numeric;
      IF v_amount < 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
        RAISE EXCEPTION 'update_po_payment_schedule: amountCents must be a whole, non-negative number of cents'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_label := NULLIF(btrim(v_entry->>'label'), '');
    IF v_label IS NOT NULL AND length(v_label) > 120 THEN
      RAISE EXCEPTION 'update_po_payment_schedule: label is longer than 120 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.po_payments
       SET amount_cents = CASE WHEN v_entry ? 'amountCents' THEN v_amount::integer ELSE amount_cents END,
           due_date     = CASE WHEN v_entry ? 'dueDate' THEN NULLIF(v_entry->>'dueDate', '')::date ELSE due_date END,
           label        = CASE WHEN v_entry ? 'label' THEN v_label ELSE label END
     WHERE id = v_id;
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.po_payments
     WHERE purchase_order_id = p_po_id
     ORDER BY sort_order, created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.update_po_payment_schedule(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_po_payment_schedule(uuid, jsonb) TO authenticated;
