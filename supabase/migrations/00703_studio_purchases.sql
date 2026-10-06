-- ═══════════════════════════════════════════════════════════════════════════
-- 00703 — Studio purchases: card buys, one-offs and reimbursables
--         (US-16 Phase 2, C-25; SQ-418)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M9. A purchase is a lighter record than a PO, for anything bought on
-- the spot or on a card: retail on the studio card, an antique or auction
-- piece, a one-off from someone who is not a vendor, a studio-paid expense to
-- pass through. Today a flea-market piece needs a made-up vendor row to get a
-- PO (purchase_orders.vendor_id is NOT NULL) and a reimbursable is only an
-- ad-hoc invoice line with no cost record.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- studio_purchases
--   Subject: organization_id, project_id (NULL = studio overhead), ffe_item_id
--   (needs project_id), kind, description. Payee: payee_name (just a name),
--   vendor_id and studio_contact_id optional, so there is no forced vendor
--   record. Money in integer cents: amount, tax, buyer's premium, shipping.
--   Who paid: payment_method_id (studio_payment_methods, 00695),
--   paid_by_member_id, reimburse_member ("reimburse Maya $86": Patina records
--   it, it does not pay people). Receipt and return: receipt_document_path,
--   returnable, return_by, returned_on. Billing: billable_to_client (default
--   true) and billing_rule (default at_cost, R-PB7; the R1 ruling decides
--   whether cost_plus is ever shown), invoice_line_id stamped by the billing
--   path so nothing is billed twice. Lifecycle: recorded | billed | returned |
--   void.
--   Read: a project purchase follows the project (can_buy_for_project,
--   00702); a studio-overhead purchase follows the organization
--   (is_active_org_member). Written only through the RPCs below.
--
-- record_studio_purchase(p_request jsonb)
--   Records a purchase. When ffeItemId is set, the line is advanced to
--   'ordered' under the FF&E guard, the same rules create_purchase_order
--   applies to its lines (00186/00449): the caller passes
--   _ffe_require_studio_project; the line is active, selected, not blocked
--   by a client decision, not trade scope, not on a purchase order, not
--   already ordered and not already bought; the status write is
--   ffe_status_rank-ratcheted (00184) and runs under the RPC-only flag
--   (00435/00438). The line's vendor_name is set from payee_name.
--   A purchase never creates po_payments: it is already paid when recorded.
--
-- void_studio_purchase(p_purchase_id, p_reason)
--   Voids a recorded or returned purchase, with a reason. Refused once billed
--   (take it off the invoice first). A line this purchase advanced goes back
--   to 'approved' when it still sits at 'ordered' with no purchase order and
--   no other live purchase (00184's cancel precedent).
--
-- Not here: the return path (returned_on / status returned has no writer
-- yet), the billing writer (the invoice composer stamps invoice_line_id), the
-- return-by Desk need (M8).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. studio_purchases ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.studio_purchases (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- projects.studio_id, else the owner's primary studio; for overhead, the
  -- caller's studio. NULL only for a project whose owner has no studio.
  organization_id       uuid        REFERENCES public.organizations(id),
  -- No cascade: a project with recorded purchases cannot be deleted.
  project_id            uuid        REFERENCES public.projects(id),
  ffe_item_id           uuid        REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  kind                  text        NOT NULL,
  description           text,
  payee_name            text        NOT NULL,
  vendor_id             uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  studio_contact_id     uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  purchased_on          date        NOT NULL,
  amount_cents          integer     NOT NULL,
  tax_cents             integer     NOT NULL DEFAULT 0,
  buyer_premium_cents   integer     NOT NULL DEFAULT 0,
  shipping_cents        integer     NOT NULL DEFAULT 0,
  currency_code         text        NOT NULL DEFAULT 'USD',
  payment_method_id     uuid        REFERENCES public.studio_payment_methods(id),
  paid_by_member_id     uuid        REFERENCES public.organization_members(id) ON DELETE SET NULL,
  reimburse_member      boolean     NOT NULL DEFAULT false,
  receipt_document_path text,
  returnable            boolean     NOT NULL DEFAULT false,
  return_by             date,
  returned_on           date,
  billable_to_client    boolean     NOT NULL DEFAULT true,
  billing_rule          text        NOT NULL DEFAULT 'at_cost',
  invoice_line_id       uuid        REFERENCES public.invoice_line_items(id) ON DELETE SET NULL,
  status                text        NOT NULL DEFAULT 'recorded',
  recorded_by           uuid,
  voided_at             timestamptz,
  voided_by             uuid,
  void_reason           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_purchases_subject_ck
    CHECK (project_id IS NOT NULL OR organization_id IS NOT NULL),
  CONSTRAINT studio_purchases_line_needs_project_ck
    CHECK (ffe_item_id IS NULL OR project_id IS NOT NULL),
  CONSTRAINT studio_purchases_kind_ck
    CHECK (kind IN ('card_retail', 'one_off', 'antique_auction', 'expense', 'sample_fee')),
  CONSTRAINT studio_purchases_text_ck
    CHECK (char_length(btrim(payee_name)) BETWEEN 1 AND 200
       AND (description IS NULL OR char_length(description) <= 500)
       AND (receipt_document_path IS NULL OR char_length(receipt_document_path) <= 1024)),
  CONSTRAINT studio_purchases_money_ck
    CHECK (amount_cents > 0 AND tax_cents >= 0 AND buyer_premium_cents >= 0 AND shipping_cents >= 0),
  CONSTRAINT studio_purchases_currency_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT studio_purchases_reimburse_ck
    CHECK (NOT reimburse_member OR paid_by_member_id IS NOT NULL),
  CONSTRAINT studio_purchases_return_ck
    CHECK ((return_by IS NULL OR returnable) AND (status <> 'returned' OR returned_on IS NOT NULL)),
  CONSTRAINT studio_purchases_billing_rule_ck
    CHECK (billing_rule IN ('at_cost', 'cost_plus')),
  CONSTRAINT studio_purchases_status_ck
    CHECK (status IN ('recorded', 'billed', 'returned', 'void')),
  CONSTRAINT studio_purchases_void_ck
    CHECK ((status = 'void') = (voided_at IS NOT NULL)
       AND (voided_at IS NULL) = (void_reason IS NULL)
       AND (void_reason IS NULL OR char_length(btrim(void_reason)) BETWEEN 1 AND 500))
);

-- One live purchase per line: a line is bought once.
CREATE UNIQUE INDEX IF NOT EXISTS studio_purchases_one_live_per_line
  ON public.studio_purchases (ffe_item_id)
  WHERE ffe_item_id IS NOT NULL AND status IN ('recorded', 'billed');
CREATE INDEX IF NOT EXISTS idx_studio_purchases_project
  ON public.studio_purchases (project_id, purchased_on)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studio_purchases_org
  ON public.studio_purchases (organization_id, purchased_on);
CREATE INDEX IF NOT EXISTS idx_studio_purchases_unbilled
  ON public.studio_purchases (project_id)
  WHERE status = 'recorded' AND billable_to_client AND invoice_line_id IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_studio_purchases ON public.studio_purchases;
CREATE TRIGGER set_updated_at_studio_purchases
  BEFORE UPDATE ON public.studio_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.studio_purchases IS
  'Card purchases, one-offs and reimbursables (00703, C-25, d2 §M9): a lighter record than a PO, '
  'already paid when recorded, so it never creates po_payments. Read: can_buy_for_project for a '
  'project purchase, is_active_org_member for studio overhead. Written only through '
  'record_studio_purchase / void_studio_purchase.';
COMMENT ON COLUMN public.studio_purchases.billing_rule IS
  'at_cost (default, R-PB7) | cost_plus. Whether the client ever sees a cost-plus add-on is the R1 ruling.';
COMMENT ON COLUMN public.studio_purchases.invoice_line_id IS
  'The invoice line this purchase was billed on, stamped by the billing path so nothing is billed twice.';

ALTER TABLE public.studio_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_purchases_studio_select ON public.studio_purchases;
CREATE POLICY studio_purchases_studio_select ON public.studio_purchases
  FOR SELECT TO authenticated
  USING (
    CASE WHEN project_id IS NOT NULL THEN public.can_buy_for_project(project_id)
         ELSE public.is_active_org_member(organization_id)
    END
  );

REVOKE ALL ON TABLE public.studio_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_purchases TO service_role;

-- ─── 2. record_studio_purchase ──────────────────────────────────────────────
-- p_request (camelCase): kind, payeeName, amountCents (required);
-- projectId, ffeItemId, organizationId, description, vendorId,
-- studioContactId, purchasedOn (default today), taxCents, buyerPremiumCents,
-- shippingCents, currencyCode (default USD), paymentMethodId, paidByMemberId,
-- reimburseMember, receiptDocumentPath, returnable, returnBy,
-- billableToClient (default true), billingRule (default at_cost).

CREATE OR REPLACE FUNCTION public.record_studio_purchase(p_request jsonb)
RETURNS public.studio_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['projectId', 'ffeItemId', 'organizationId', 'kind', 'description',
    'payeeName', 'vendorId', 'studioContactId', 'purchasedOn', 'amountCents', 'taxCents',
    'buyerPremiumCents', 'shippingCents', 'currencyCode', 'paymentMethodId', 'paidByMemberId',
    'reimburseMember', 'receiptDocumentPath', 'returnable', 'returnBy', 'billableToClient', 'billingRule'];
  v_number_keys constant text[] := ARRAY['amountCents', 'taxCents', 'buyerPremiumCents', 'shippingCents'];
  v_bool_keys constant text[] := ARRAY['reimburseMember', 'returnable', 'billableToClient'];
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_project_id uuid;
  v_item_id uuid;
  v_org_id uuid;
  v_vendor_id uuid;
  v_contact_id uuid;
  v_pm_id uuid;
  v_member_id uuid;
  v_project public.projects%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_pm public.studio_payment_methods%ROWTYPE;
  v_kind text := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_payee text := NULLIF(btrim(COALESCE(v_req->>'payeeName', '')), '');
  v_description text := NULLIF(btrim(COALESCE(v_req->>'description', '')), '');
  v_receipt text := NULLIF(btrim(COALESCE(v_req->>'receiptDocumentPath', '')), '');
  v_currency text := upper(COALESCE(NULLIF(btrim(COALESCE(v_req->>'currencyCode', '')), ''), 'USD'));
  v_rule text := COALESCE(NULLIF(btrim(COALESCE(v_req->>'billingRule', '')), ''), 'at_cost');
  v_purchased_on date;
  v_return_by date;
  v_amount numeric;
  v_tax numeric;
  v_premium numeric;
  v_shipping numeric;
  v_key text;
  v_row public.studio_purchases%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_studio_purchase: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_studio_purchase: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_studio_purchase: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key = ANY (v_number_keys) THEN 'number'
         WHEN v_key = ANY (v_bool_keys) THEN 'boolean'
         ELSE 'string' END) THEN
      RAISE EXCEPTION 'record_studio_purchase: % has the wrong type', v_key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  BEGIN
    v_project_id := NULLIF(btrim(COALESCE(v_req->>'projectId', '')), '')::uuid;
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    v_org_id := NULLIF(btrim(COALESCE(v_req->>'organizationId', '')), '')::uuid;
    v_vendor_id := NULLIF(btrim(COALESCE(v_req->>'vendorId', '')), '')::uuid;
    v_contact_id := NULLIF(btrim(COALESCE(v_req->>'studioContactId', '')), '')::uuid;
    v_pm_id := NULLIF(btrim(COALESCE(v_req->>'paymentMethodId', '')), '')::uuid;
    v_member_id := NULLIF(btrim(COALESCE(v_req->>'paidByMemberId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_studio_purchase: projectId, ffeItemId, organizationId, vendorId, studioContactId, paymentMethodId and paidByMemberId must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_purchased_on := COALESCE(NULLIF(btrim(COALESCE(v_req->>'purchasedOn', '')), '')::date, v_utc_day);
    v_return_by := NULLIF(btrim(COALESCE(v_req->>'returnBy', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_studio_purchase: purchasedOn and returnBy must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;

  -- ── Subject: the line, its project, the studio ──
  IF v_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_studio_purchase: line not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_project_id IS NOT NULL AND v_project_id <> v_item.project_id THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is on another project'
        USING ERRCODE = 'check_violation';
    END IF;
    v_project_id := v_item.project_id;
  END IF;

  IF v_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_project_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_project_id := v_project.id;
    IF v_org_id IS NOT NULL
       AND v_org_id IS DISTINCT FROM COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)) THEN
      RAISE EXCEPTION 'record_studio_purchase: organizationId is not the project''s studio'
        USING ERRCODE = 'check_violation';
    END IF;
    v_org_id := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
  ELSE
    -- Studio overhead: the named studio, else the caller's only studio.
    IF v_org_id IS NULL THEN
      SELECT CASE WHEN count(DISTINCT organization_id) = 1 THEN (array_agg(organization_id))[1] END
        INTO v_org_id
        FROM public.organization_members
       WHERE user_id = v_uid AND status = 'active' AND role <> 'guest';
      IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'record_studio_purchase: organizationId is required for a purchase without a project'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NOT public.is_active_org_member(v_org_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: studio not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── The FF&E guard (create_purchase_order's line rules) ──
  IF v_item_id IS NOT NULL THEN
    PERFORM public._ffe_require_studio_project(v_project_id);
    IF v_item.removed_at IS NOT NULL OR v_item.design_disposition IS DISTINCT FROM 'selected' THEN
      RAISE EXCEPTION 'record_studio_purchase: only an active selected line can be bought'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.blocked IS TRUE THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is blocked pending a client decision'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: trade scope lines are not bought'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.purchase_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is already on a purchase order'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.ffe_status_rank(v_item.status) >= public.ffe_status_rank('ordered') THEN
      RAISE EXCEPTION 'record_studio_purchase: the line is already %', v_item.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.studio_purchases
       WHERE ffe_item_id = v_item_id AND status IN ('recorded', 'billed')
    ) THEN
      RAISE EXCEPTION 'record_studio_purchase: the line was already bought'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── What, who, how much ──
  IF v_kind IS NULL OR v_kind NOT IN ('card_retail', 'one_off', 'antique_auction', 'expense', 'sample_fee') THEN
    RAISE EXCEPTION 'record_studio_purchase: kind must be card_retail, one_off, antique_auction, expense or sample_fee'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_payee IS NULL OR char_length(v_payee) > 200 THEN
    RAISE EXCEPTION 'record_studio_purchase: payeeName is required (at most 200 characters)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_description) > 500 OR char_length(v_receipt) > 1024 THEN
    RAISE EXCEPTION 'record_studio_purchase: description is at most 500 characters, receiptDocumentPath 1024'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_purchased_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_studio_purchase: purchasedOn % is in the future', v_purchased_on
      USING ERRCODE = 'check_violation';
  END IF;

  v_amount := (v_req->>'amountCents')::numeric;
  v_tax := COALESCE((v_req->>'taxCents')::numeric, 0);
  v_premium := COALESCE((v_req->>'buyerPremiumCents')::numeric, 0);
  v_shipping := COALESCE((v_req->>'shippingCents')::numeric, 0);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'record_studio_purchase: amountCents is required and must be positive'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_tax < 0 OR v_premium < 0 OR v_shipping < 0
     OR v_amount <> trunc(v_amount) OR v_tax <> trunc(v_tax)
     OR v_premium <> trunc(v_premium) OR v_shipping <> trunc(v_shipping)
     OR v_amount + v_tax + v_premium + v_shipping > 2147483647 THEN
    RAISE EXCEPTION 'record_studio_purchase: amounts are whole, non-negative cents'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'record_studio_purchase: currencyCode must be a three-letter code'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_rule NOT IN ('at_cost', 'cost_plus') THEN
    RAISE EXCEPTION 'record_studio_purchase: billingRule must be at_cost or cost_plus'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
    RAISE EXCEPTION 'record_studio_purchase: vendor % not found', v_vendor_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_contacts
     WHERE id = v_contact_id AND organization_id IS NOT DISTINCT FROM v_org_id AND v_org_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'record_studio_purchase: studioContactId must be a card in this studio''s rolodex'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_org_id IS NOT NULL AND v_pm.organization_id <> v_org_id THEN
      RAISE EXCEPTION 'record_studio_purchase: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_org_id := COALESCE(v_org_id, v_pm.organization_id);
  END IF;

  IF v_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE id = v_member_id AND organization_id = v_org_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'record_studio_purchase: paidByMemberId must be an active member of the studio'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE((v_req->>'reimburseMember')::boolean, false) AND v_member_id IS NULL THEN
    RAISE EXCEPTION 'record_studio_purchase: reimburseMember needs paidByMemberId'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_return_by IS NOT NULL AND NOT COALESCE((v_req->>'returnable')::boolean, false) THEN
    RAISE EXCEPTION 'record_studio_purchase: returnBy needs returnable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_return_by < v_purchased_on THEN
    RAISE EXCEPTION 'record_studio_purchase: returnBy is before purchasedOn'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.studio_purchases (
    organization_id, project_id, ffe_item_id, kind, description, payee_name, vendor_id,
    studio_contact_id, purchased_on, amount_cents, tax_cents, buyer_premium_cents, shipping_cents,
    currency_code, payment_method_id, paid_by_member_id, reimburse_member, receipt_document_path,
    returnable, return_by, billable_to_client, billing_rule, recorded_by
  ) VALUES (
    v_org_id, v_project_id, v_item_id, v_kind, v_description, v_payee, v_vendor_id,
    v_contact_id, v_purchased_on, v_amount::integer, v_tax::integer, v_premium::integer, v_shipping::integer,
    v_currency, v_pm_id, v_member_id, COALESCE((v_req->>'reimburseMember')::boolean, false), v_receipt,
    COALESCE((v_req->>'returnable')::boolean, false), v_return_by,
    COALESCE((v_req->>'billableToClient')::boolean, true), v_rule, v_uid
  )
  RETURNING * INTO v_row;

  IF v_item_id IS NOT NULL THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
       SET status = 'ordered',
           vendor_name = v_payee,
           updated_at = now()
     WHERE id = v_item_id
       AND public.ffe_status_rank(status) < public.ffe_status_rank('ordered');
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_studio_purchase(jsonb) IS
  'Records a card purchase, one-off or reimbursable (00703, C-25). With ffeItemId, advances the line to '
  '''ordered'' under the FF&E guard (create_purchase_order''s line rules, rank-ratcheted) and sets its '
  'vendor_name from payeeName. Never creates po_payments. Gate: can_buy_for_project, or '
  'is_active_org_member for studio overhead.';

REVOKE ALL ON FUNCTION public.record_studio_purchase(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_studio_purchase(jsonb) TO authenticated;

-- ─── 3. void_studio_purchase ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_studio_purchase(p_purchase_id uuid, p_reason text)
RETURNS public.studio_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row public.studio_purchases%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'void_studio_purchase: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Same lock order as record_studio_purchase: the line, then the purchase.
  PERFORM 1 FROM public.project_ffe_items
   WHERE id = (SELECT ffe_item_id FROM public.studio_purchases WHERE id = p_purchase_id)
     FOR UPDATE;
  SELECT * INTO v_row FROM public.studio_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND OR NOT (CASE
       WHEN v_row.project_id IS NOT NULL THEN public.can_buy_for_project(v_row.project_id)
       ELSE public.is_active_org_member(v_row.organization_id)
     END) THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % not found or access denied', p_purchase_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'void_studio_purchase: a reason is required (at most 500 characters)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'void' THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % is already void', p_purchase_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'billed' OR v_row.invoice_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % was billed to the client; take it off the invoice first', p_purchase_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.studio_purchases
     SET status = 'void', voided_at = now(), voided_by = v_uid, void_reason = v_reason
   WHERE id = p_purchase_id
  RETURNING * INTO v_row;

  -- The line this purchase advanced goes back, as a cancelled PO's lines do
  -- (00184): only from 'ordered', with no PO and no other live purchase.
  IF v_row.ffe_item_id IS NOT NULL THEN
    PERFORM public._ffe_require_studio_project(v_row.project_id);
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items item
       SET status = 'approved', updated_at = now()
     WHERE item.id = v_row.ffe_item_id
       AND item.status = 'ordered'
       AND item.purchase_order_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.studio_purchases other
          WHERE other.ffe_item_id = item.id AND other.status IN ('recorded', 'billed')
       );
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.void_studio_purchase(uuid, text) IS
  'Voids a studio purchase with a reason (00703, C-25). Refused once billed. A line it advanced goes back '
  'to ''approved'' when still ''ordered'' with no PO and no other live purchase.';

REVOKE ALL ON FUNCTION public.void_studio_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_studio_purchase(uuid, text) TO authenticated;
