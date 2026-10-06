-- ═══════════════════════════════════════════════════════════════════════════
-- 00709 — Client deposit and balance slots; riders and purchases billed on
--         their own lines (US-16 Phase 2, C-31; SQ-420)
-- ═══════════════════════════════════════════════════════════════════════════
-- d1 D1-14: "never spend the studio's money ahead of the client's". Until now
-- an FF&E line had one live billing slot (00187 uniq_invoice_line_items_
-- ffe_item), so a product deposit and then its balance had to be faked.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- invoice_line_items.billing_stage      full (default, today's slot) |
--                                       deposit | balance
-- invoice_line_items.billing_stage_pct  the deposit's percent (deposit only)
-- uniq_invoice_line_items_ffe_item      same name, now one slot per
--   (line, stage). A line is billed either in full or as a deposit/balance
--   pair, never both: guard_invoice_line_ffe_stage refuses the mix with the
--   same SQLSTATE (23505) and names the index, so callers that match on it
--   keep working.
-- get_ffe_invoice_coverage(project)     same signature, still one row per
--   line; it now sums every live slot. coverage = paid only when the line is
--   closed (a full or balance slot) and every live slot is paid; a deposit
--   alone reads invoiced.
-- get_ffe_invoice_stage_coverage(project)  one row per live slot, for "deposit
--   billed №0217 · paid · balance unbilled".
-- add_invoice_billing_lines(p_invoice_id, p_lines jsonb)
--   THE BILLING WRITER (C-31, R-PB7). Adds lines to a draft invoice the caller
--   can manage and stamps what they bill, so nothing is billed twice. Each
--   element names exactly one subject:
--     { purchaseId }     a studio_purchases row (00703): recorded, billable to
--                        the client, never stamped. Billed at cost (amount +
--                        tax + buyer's premium + shipping) on its own adhoc
--                        line; stamps invoice_line_id and status billed. Gate:
--                        can_buy_for_project, same project as the invoice.
--     { costLineId }     a po_cost_lines rider (00704): billable to the
--                        client, never stamped. Billed at cost (actual, else
--                        estimate) on its own adhoc line; stamps
--                        invoice_line_id. Gate: can_send_purchase_order, the
--                        PO on the invoice's project.
--     { ffeItemId, stage: deposit, depositPct }  round(qty × client price ×
--                        pct / 100) on the line's deposit slot.
--     { ffeItemId, stage: balance }  client price less the live deposits.
--   Each may carry amountCents (an override, R-PB7 "overridable"),
--   description and sortOrder. cost_plus bills at cost until R1 rules (no
--   markup is invented here). Tax stays the invoice's entered rate. Totals
--   are recomputed the way create_draft_invoice computes them.
-- Stamps release when the bill goes away: deleting the line (FK SET NULL) or
--   voiding the invoice returns a purchase to recorded and frees a rider.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
-- create_draft_invoice (00511) is not redefined; its lines stay full slots.
-- No client date promise or deposit wording (R7 open). Per-line taxability is
-- a CPA matter. Whether a purchase tied to a line should also stop that line's
-- client-price slot is the composer's call (SQ-429), warned, never blocked
-- (R8/R9).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Billing stage on invoice lines ──────────────────────────────────────

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS billing_stage text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS billing_stage_pct numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'invoice_line_items_billing_stage_ck'
       AND conrelid = 'public.invoice_line_items'::regclass
  ) THEN
    ALTER TABLE public.invoice_line_items
      ADD CONSTRAINT invoice_line_items_billing_stage_ck
      CHECK (billing_stage IN ('full', 'deposit', 'balance')
         AND (billing_stage_pct IS NULL
              OR (billing_stage = 'deposit' AND billing_stage_pct > 0 AND billing_stage_pct <= 100)));
  END IF;
END $$;

COMMENT ON COLUMN public.invoice_line_items.billing_stage IS
  'Which billing slot of its FF&E line this invoice line fills (00709, C-31): full (default) | deposit | '
  'balance. One slot per (line, stage); a full bill and a deposit/balance pair never share a line.';
COMMENT ON COLUMN public.invoice_line_items.billing_stage_pct IS
  'A deposit line''s percent of the line''s client price (00709). Null on every other stage.';

-- Same index name as 00187 so callers and tests that match on it keep working.
DROP INDEX IF EXISTS public.uniq_invoice_line_items_ffe_item;
CREATE UNIQUE INDEX uniq_invoice_line_items_ffe_item
  ON public.invoice_line_items (ffe_item_id, billing_stage)
  WHERE ffe_item_id IS NOT NULL;

-- ─── 2. A full bill and a deposit/balance pair never share a line ───────────
-- A slot is occupied while a line row carries the item, exactly as the index
-- sees it (void_invoice releases a slot by clearing ffe_item_id). The advisory
-- lock serialises two composers racing a full bill against a deposit.

CREATE OR REPLACE FUNCTION public.guard_invoice_line_ffe_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_other text;
BEGIN
  IF NEW.ffe_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_line_ffe_slot:' || NEW.ffe_item_id::text, 0));

  SELECT li.billing_stage INTO v_other
    FROM public.invoice_line_items AS li
   WHERE li.ffe_item_id = NEW.ffe_item_id
     AND li.id <> NEW.id
     AND (li.billing_stage = 'full') <> (NEW.billing_stage = 'full')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'uniq_invoice_line_items_ffe_item: line % already holds a % slot; bill it in full or as a deposit and balance, not both',
      NEW.ffe_item_id, v_other
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_line_ffe_stage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS b_guard_invoice_line_ffe_stage_trg ON public.invoice_line_items;
CREATE TRIGGER b_guard_invoice_line_ffe_stage_trg
  BEFORE INSERT OR UPDATE OF ffe_item_id, billing_stage ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_line_ffe_stage();

-- ─── 3. Coverage ────────────────────────────────────────────────────────────
-- Lineage: 00187 → 00709. Same signature and return shape; one row per line.

CREATE OR REPLACE FUNCTION public.get_ffe_invoice_coverage(p_project_id uuid)
RETURNS TABLE (
  ffe_item_id    uuid,
  invoice_id     uuid,
  invoice_number text,
  invoice_status text,
  billed_cents   integer,
  coverage       text
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    f.id AS ffe_item_id,
    slot.invoice_id,
    slot.invoice_number,
    slot.invoice_status,
    slot.billed_cents,
    CASE
      WHEN slot.slots = 0 THEN 'uninvoiced'
      WHEN slot.closes AND slot.all_paid THEN 'paid'
      ELSE 'invoiced'
    END AS coverage
  FROM project_ffe_items f
  CROSS JOIN LATERAL (
    -- Void invoices are filtered (a void without release is unreachable via
    -- the RPCs, but must not report stale money).
    SELECT
      count(li.id) AS slots,
      sum(li.amount_cents)::integer AS billed_cents,
      COALESCE(bool_and(i.status = 'paid'), false) AS all_paid,
      COALESCE(bool_or(li.billing_stage IN ('full', 'balance')), false) AS closes,
      -- The closing (full/balance) slot's invoice when there is one, else the
      -- deposit's: a balance always follows its deposit, so this is the
      -- latest slot without depending on created_at ties.
      (array_agg(i.id ORDER BY (li.billing_stage <> 'deposit') DESC, li.created_at DESC, li.id DESC))[1] AS invoice_id,
      (array_agg(i.invoice_number ORDER BY (li.billing_stage <> 'deposit') DESC, li.created_at DESC, li.id DESC))[1] AS invoice_number,
      (array_agg(i.status ORDER BY (li.billing_stage <> 'deposit') DESC, li.created_at DESC, li.id DESC))[1] AS invoice_status
    FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id AND i.status <> 'void'
    WHERE li.ffe_item_id = f.id
  ) AS slot
  WHERE f.project_id = p_project_id
$$;

COMMENT ON FUNCTION public.get_ffe_invoice_coverage(uuid) IS
  'One row per FF&E line (00187 → 00709): billed_cents sums the live slots; invoice_* is the closing '
  '(full/balance) slot''s invoice, else the deposit''s; coverage paid only when a full or balance slot exists and every live slot is paid, '
  'invoiced when any live slot exists, else uninvoiced. SECURITY INVOKER: RLS is the gate.';

REVOKE ALL ON FUNCTION public.get_ffe_invoice_coverage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ffe_invoice_coverage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ffe_invoice_stage_coverage(p_project_id uuid)
RETURNS TABLE (
  ffe_item_id       uuid,
  billing_stage     text,
  billing_stage_pct numeric,
  invoice_line_id   uuid,
  invoice_id        uuid,
  invoice_number    text,
  invoice_status    text,
  billed_cents      integer,
  coverage          text
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    li.ffe_item_id,
    li.billing_stage,
    li.billing_stage_pct,
    li.id,
    i.id,
    i.invoice_number,
    i.status,
    li.amount_cents,
    CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END
  FROM project_ffe_items f
  JOIN invoice_line_items li ON li.ffe_item_id = f.id
  JOIN invoices i ON i.id = li.invoice_id AND i.status <> 'void'
  WHERE f.project_id = p_project_id
  ORDER BY li.ffe_item_id,
           CASE li.billing_stage WHEN 'deposit' THEN 0 WHEN 'balance' THEN 1 ELSE 2 END
$$;

COMMENT ON FUNCTION public.get_ffe_invoice_stage_coverage(uuid) IS
  'One row per live billing slot on a project''s FF&E lines (00709, C-31): stage, deposit percent, '
  'invoice and paid/invoiced. A stage with no row is unbilled. SECURITY INVOKER: RLS is the gate.';

REVOKE ALL ON FUNCTION public.get_ffe_invoice_stage_coverage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ffe_invoice_stage_coverage(uuid) TO authenticated;

-- ─── 4. add_invoice_billing_lines — the billing writer ──────────────────────

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
  IF NOT FOUND OR NOT public._can_manage_invoice_owner(v_invoice.designer_id) THEN
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
        jsonb_build_object('studioPurchaseId', v_purchase.id, 'billingRule', v_purchase.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

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
                           'riderKind', v_rider.kind, 'billingRule', v_rider.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

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

COMMENT ON FUNCTION public.add_invoice_billing_lines(uuid, jsonb) IS
  'The billing writer (00709, C-31, R-PB7): adds lines to a draft invoice the caller can manage. '
  '{purchaseId} bills a recorded, client-billable studio purchase at cost and stamps it billed; '
  '{costLineId} bills a client-billable PO rider at cost and stamps it; {ffeItemId, stage} bills a '
  'deposit (depositPct) or the balance. amountCents overrides. A stamped, voided or returned purchase '
  'and a stamped rider are refused, so nothing bills twice. Recomputes the draft''s totals.';

REVOKE ALL ON FUNCTION public.add_invoice_billing_lines(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_invoice_billing_lines(uuid, jsonb) TO authenticated;

-- ─── 5. Stamps release when the bill goes away ──────────────────────────────
-- Deleting the line (a draft edit, or deleting the draft) clears the stamp by
-- FK SET NULL; a billed purchase then reads recorded again.

CREATE OR REPLACE FUNCTION public.release_studio_purchase_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.invoice_line_id IS NOT NULL AND NEW.invoice_line_id IS NULL AND NEW.status = 'billed' THEN
    NEW.status := 'recorded';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_studio_purchase_billing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS release_studio_purchase_billing_trg ON public.studio_purchases;
CREATE TRIGGER release_studio_purchase_billing_trg
  BEFORE UPDATE OF invoice_line_id ON public.studio_purchases
  FOR EACH ROW EXECUTE FUNCTION public.release_studio_purchase_billing();

-- Voiding keeps the lines (void_invoice rewrites them), so the FK never fires:
-- clear the stamps that point at the voided invoice's lines.
CREATE OR REPLACE FUNCTION public.release_billing_stamps_on_invoice_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.studio_purchases
     SET invoice_line_id = NULL
   WHERE invoice_line_id IN (SELECT id FROM public.invoice_line_items WHERE invoice_id = NEW.id);
  UPDATE public.po_cost_lines
     SET invoice_line_id = NULL
   WHERE invoice_line_id IN (SELECT id FROM public.invoice_line_items WHERE invoice_id = NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_billing_stamps_on_invoice_void() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS release_billing_stamps_on_invoice_void_trg ON public.invoices;
CREATE TRIGGER release_billing_stamps_on_invoice_void_trg
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void')
  EXECUTE FUNCTION public.release_billing_stamps_on_invoice_void();
