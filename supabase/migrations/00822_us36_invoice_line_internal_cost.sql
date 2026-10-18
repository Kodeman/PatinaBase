-- ═══════════════════════════════════════════════════════════════════════════
-- 00822 — Internal invoice line economics live outside household-readable rows.
-- Writer lineage: 00709 → 00718 → 00817; 00821 calls this writer unchanged.
-- Backfill only updates rows with private metadata; no table rewrite/trigger toggle.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.invoice_line_item_internals (
  line_item_id uuid PRIMARY KEY REFERENCES public.invoice_line_items(id) ON DELETE CASCADE,
  internal_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.invoice_line_item_internals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_line_item_internals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_line_item_internals TO authenticated;
GRANT ALL ON public.invoice_line_item_internals TO service_role;
DROP POLICY IF EXISTS invoice_line_item_internals_designer_select ON public.invoice_line_item_internals;
CREATE POLICY invoice_line_item_internals_designer_select
  ON public.invoice_line_item_internals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoice_line_items AS line
    WHERE line.id = line_item_id AND public.can_manage_invoice(line.invoice_id)
  ));

-- Cost-line identifiers are client-safe references, unlike cost amounts.
CREATE OR REPLACE FUNCTION public._invoice_line_private_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_key ~* '(markup|margin|retail|trade_?(price|cents))'
      OR p_key ~* 'cost($|_|cents|price|amount|total|rate|value)'
$$;

CREATE OR REPLACE FUNCTION public._invoice_line_public_metadata(p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_public jsonb;
BEGIN
  IF jsonb_typeof(p_metadata) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key, public._invoice_line_public_metadata(value)), '{}'::jsonb)
      INTO v_public FROM jsonb_each(p_metadata)
     WHERE NOT public._invoice_line_private_key(key);
    RETURN v_public;
  ELSIF jsonb_typeof(p_metadata) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public._invoice_line_public_metadata(value) ORDER BY ord), '[]'::jsonb)
      INTO v_public FROM jsonb_array_elements(p_metadata) WITH ORDINALITY AS element(value, ord);
    RETURN v_public;
  END IF;
  RETURN p_metadata;
END;
$$;

-- Kept callable by the DB owner for an idempotent backfill regression; not an
-- authenticated route. Store the old metadata byte-value before stripping it.
CREATE OR REPLACE FUNCTION public._move_invoice_line_internal_metadata()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
  SELECT id, metadata FROM public.invoice_line_items
   WHERE metadata <> public._invoice_line_public_metadata(metadata)
  ON CONFLICT (line_item_id) DO UPDATE
    SET internal_metadata = invoice_line_item_internals.internal_metadata || EXCLUDED.internal_metadata;

  UPDATE public.invoice_line_items
     SET metadata = public._invoice_line_public_metadata(metadata)
   WHERE metadata <> public._invoice_line_public_metadata(metadata);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._move_invoice_line_internal_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._move_invoice_line_internal_metadata() TO service_role;
SELECT public._move_invoice_line_internal_metadata();

-- Direct draft inserts/updates and studio invoice metadata cannot reintroduce
-- private keys after this migration. Existing JSON is scrubbed before validation.
ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata)) NOT VALID;
ALTER TABLE public.invoice_line_items VALIDATE CONSTRAINT invoice_line_items_public_metadata_ck;

-- The complete latest body is 00817; change only the two cost storage sites.
CREATE OR REPLACE FUNCTION public.add_invoice_billing_lines(p_invoice_id uuid, p_lines jsonb)
RETURNS SETOF public.invoice_line_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_keys      constant text[] := ARRAY['purchaseId', 'costLineId', 'ffeItemId', 'stage', 'depositPct',
                                       'amountCents', 'description', 'sortOrder'];
  v_invoice   public.invoices%ROWTYPE;
  v_purchase  public.studio_purchases%ROWTYPE;
  v_rider     public.po_cost_lines%ROWTYPE;
  v_item      public.project_ffe_items%ROWTYPE;
  v_line      public.invoice_line_items%ROWTYPE;
  v_el        jsonb;
  v_ids       uuid[] := '{}';
  v_subject   uuid;
  v_override  bigint;
  v_cost      bigint;
  v_amount    bigint;
  v_price     bigint;
  v_deposited bigint;
  v_staged    bigint;
  v_pct       numeric;
  v_stage     text;
  v_desc      text;
  v_sort      integer;
  v_next_sort integer;
  v_po_project uuid;
  v_subtotal  bigint;
  v_tax       bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % not found or access denied', p_invoice_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % is %, not a draft', p_invoice_id, v_invoice.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice.project_id IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: a studio invoice has no project to bill from'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: lines must be an array of 1 to 200 objects'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_next_sort
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR (v_el - v_keys) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line is an object with keys %', array_to_string(v_keys, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
    IF (CASE WHEN v_el ? 'purchaseId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'costLineId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'ffeItemId' THEN 1 ELSE 0 END) <> 1 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line names exactly one of purchaseId, costLineId, ffeItemId'
        USING ERRCODE = 'check_violation';
    END IF;

    -- amountCents: the R-PB7 override, a whole number of cents.
    v_override := NULL;
    IF v_el ? 'amountCents' AND jsonb_typeof(v_el->'amountCents') <> 'null' THEN
      IF jsonb_typeof(v_el->'amountCents') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'amountCents')::numeric <> trunc((v_el->>'amountCents')::numeric)
         OR (v_el->>'amountCents')::numeric < 0
         OR (v_el->>'amountCents')::numeric > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_override := (v_el->>'amountCents')::numeric::bigint;
    END IF;

    IF jsonb_typeof(COALESCE(v_el->'description', 'null'::jsonb)) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description must be a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_desc := NULLIF(btrim(COALESCE(v_el->>'description', '')), '');
    IF char_length(v_desc) > 2000 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description is at most 2000 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'sortOrder' AND jsonb_typeof(v_el->'sortOrder') <> 'null' THEN
      IF jsonb_typeof(v_el->'sortOrder') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'sortOrder')::numeric <> trunc((v_el->>'sortOrder')::numeric)
         OR (v_el->>'sortOrder')::numeric < 0
         OR (v_el->>'sortOrder')::numeric > 1000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_sort := (v_el->>'sortOrder')::numeric::integer;
    ELSE
      v_next_sort := v_next_sort + 1;
      v_sort := v_next_sort;
    END IF;

    BEGIN
      v_subject := NULLIF(btrim(COALESCE(v_el->>'purchaseId', v_el->>'costLineId', v_el->>'ffeItemId', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END;
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'purchaseId' THEN
      -- ── A studio purchase, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR v_purchase.project_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_purchase.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status = 'void' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was voided', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.invoice_line_id IS NOT NULL OR v_purchase.status = 'billed' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status <> 'recorded' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was %', v_subject, v_purchase.status
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_purchase.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.currency_code <> v_invoice.currency THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is in %, the invoice in %',
          v_subject, v_purchase.currency_code, v_invoice.currency
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := v_purchase.amount_cents::bigint + v_purchase.tax_cents
              + v_purchase.buyer_premium_cents + v_purchase.shipping_cents;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(COALESCE(NULLIF(btrim(v_purchase.description), ''), v_purchase.payee_name), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('studioPurchaseId', v_purchase.id, 'billingRule', v_purchase.billing_rule),
        v_sort
      )
      RETURNING * INTO v_line;

      INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
      VALUES (v_line.id, jsonb_build_object('costCents', v_cost));

      UPDATE public.studio_purchases
         SET invoice_line_id = v_line.id, status = 'billed'
       WHERE id = v_purchase.id;

    ELSIF v_el ? 'costLineId' THEN
      -- ── A PO rider, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_rider FROM public.po_cost_lines WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR NOT public.can_send_purchase_order(v_rider.purchase_order_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      SELECT project_id INTO v_po_project FROM public.purchase_orders WHERE id = v_rider.purchase_order_id;
      IF v_po_project IS DISTINCT FROM v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_rider.invoice_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_rider.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := COALESCE(v_rider.actual_cents, v_rider.estimate_cents);
      IF v_cost IS NULL AND v_override IS NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % has no estimate or actual; enter amountCents', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount < 0 OR v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % amount is outside 0 to 1000000000', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(initcap(replace(v_rider.kind, '_', ' '))
                              || COALESCE(' · ' || NULLIF(btrim(v_rider.note), ''), ''), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('poCostLineId', v_rider.id, 'purchaseOrderId', v_rider.purchase_order_id,
                           'riderKind', v_rider.kind, 'billingRule', v_rider.billing_rule),
        v_sort
      )
      RETURNING * INTO v_line;

      INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
      VALUES (v_line.id, jsonb_build_object('costCents', v_cost));

      UPDATE public.po_cost_lines SET invoice_line_id = v_line.id WHERE id = v_rider.id;

    ELSE
      -- ── A deposit or balance slot on an FF&E line ──
      v_stage := v_el->>'stage';
      IF v_stage IS NULL OR v_stage NOT IN ('deposit', 'balance') THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage must be deposit or balance (a full bill goes through create_draft_invoice)'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_subject FOR SHARE;
      IF NOT FOUND OR v_item.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is not on this invoice''s project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_item.removed_at IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % was removed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_price := v_item.quantity::bigint * v_item.unit_price_cents;

      v_pct := NULL;
      IF v_stage = 'deposit' THEN
        IF jsonb_typeof(COALESCE(v_el->'depositPct', 'null'::jsonb)) <> 'number' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_pct := (v_el->>'depositPct')::numeric;
        IF v_pct <= 0 OR v_pct > 100 OR v_pct <> round(v_pct, 2) THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100, to two places'
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, round(v_price * v_pct / 100)::bigint);
        -- 00718 (M4): deposit and balance sum to the price at most. A deposit
        -- re-added after its balance was computed fits in what is left.
        IF v_price IS NOT NULL THEN
          SELECT COALESCE(sum(li.amount_cents), 0) INTO v_staged
            FROM public.invoice_line_items AS li
            JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
           WHERE li.ffe_item_id = v_item.id AND li.billing_stage IN ('deposit', 'balance');
          IF v_amount > v_price - v_staged THEN
            RAISE EXCEPTION 'add_invoice_billing_lines: a deposit of % cents is more than the % cents left to bill on line %',
              v_amount, GREATEST(v_price - v_staged, 0), v_subject
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        v_desc := COALESCE(v_desc, left('Deposit (' || rtrim(to_char(v_pct, 'FM990.99'), '.') || '%) · ' || v_item.name, 2000));
      ELSE
        IF v_el ? 'depositPct' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: depositPct belongs to a deposit'
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT sum(li.amount_cents) INTO v_deposited
          FROM public.invoice_line_items AS li
          JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
         WHERE li.ffe_item_id = v_item.id AND li.billing_stage = 'deposit';
        IF v_deposited IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no deposit billed; bill it in full instead', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, v_price - v_deposited);
        IF v_amount <= 0 AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has nothing left to bill after its deposit', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        -- 00718 (M4): a balance is at most the price less the live deposits.
        IF v_price IS NOT NULL AND v_amount > v_price - v_deposited THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a balance of % cents is more than the % cents left on line % after its deposit',
            v_amount, GREATEST(v_price - v_deposited, 0), v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_desc := COALESCE(v_desc, left('Balance · ' || v_item.name, 2000));
      END IF;
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, ffe_item_id, billing_stage, billing_stage_pct, description,
        quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'ffe', v_item.id, v_stage, v_pct, v_desc,
        1, v_amount, v_amount, jsonb_build_object('billingStage', v_stage), v_sort
      )
      RETURNING * INTO v_line;
    END IF;

    v_ids := v_ids || v_line.id;
  END LOOP;

  -- Totals, the way create_draft_invoice computes them; tax stays the rate the
  -- studio entered.
  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::bigint;
  UPDATE public.invoices
     SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_subtotal + v_tax
   WHERE id = p_invoice_id;

  RETURN QUERY
    SELECT * FROM public.invoice_line_items WHERE id = ANY (v_ids) ORDER BY sort_order, created_at, id;
END;
$$;
